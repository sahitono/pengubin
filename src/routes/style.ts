import type { Buffer } from "node:buffer"
import path from "node:path"
import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import destr from "destr"
import { get } from "radash"
import sharp from "sharp"
import { HTTPException } from "hono/http-exception"
import { caching } from "cache-manager"
import type { Repository } from "../repository"
import { sqliteImageStore } from "../repository/cache/sqlite-image"
import { XYZParamValidator } from "../middleware/validator"

const queryValidator = zValidator("query", z.object({
  // format: z.string().enu.optional().default("png"),
  format: z.enum(["png", "jpeg", "webp"]).default("png"),
  tileSize: z.string().optional().pipe(z.coerce.number().int().default(512)),
  filter: z.string().optional(),
}))

interface FilterLayer {
  layerId: string
  filter: []
}

export async function apiStyle({
  config,
  style,
}: Repository) {
  const renderedCache = await caching(sqliteImageStore({
    cacheTableName: "caches",
    enableWALMode: true,
    sqliteFile: path.resolve(config.options.cache.directory, "cached-image.sqlite3"),
    ttl: config.options.cache.ttl,
  }))

  const app = new Hono()

  app.get("/style/:name", zValidator("param", z.object({ name: z.string().min(5) })), async (c) => {
    const param = c.req.valid("param")
    const tileJSON = style.get(param.name)?.tileJSON
    if (tileJSON == null) {
      throw new HTTPException(404)
    }

    return c.json({
      ...tileJSON,
      ...(Object.hasOwn(tileJSON, "json")
        ? {
            ...get<Record<string, any>>(tileJSON, "json"),
            json: undefined,
          }
        : {}),
      tiles: [`${c.req.url}/{z}/{x}/{y}`],
    })
  })

  app.get("style/:name/:z/:x/:y", XYZParamValidator, queryValidator, async (c, _next) => {
    const param = c.req.valid("param")
    const query = c.req.valid("query")

    const cacheKey = c.req.raw.url
    const cached = await renderedCache.get<Buffer>(cacheKey)
    if (cached != null) {
      return c.body(cached, 200, {
        "content-type": `image/${query.format}`,
      })
    }

    const pool = style.get(param.name)?.pool
    if (pool == null) {
      throw new HTTPException(404, { message: "Style not found" })
    }

    const renderer = await pool.acquire().promise
    let originalLayerFilter: [] | undefined
    let originalLayerId: string | undefined
    if (query.filter != null) {
      const parsed = destr<FilterLayer[]>(query.filter)[0]
      if (parsed.layerId == null) {
        throw new HTTPException(400, { message: "Missing layer ID in filter" })
      }

      const originalLayer = renderer.style.layers.find(f => f.id === parsed.layerId)
      originalLayerFilter = get(originalLayer, "filter")
      originalLayerId = parsed.layerId
      renderer.map.setFilter(parsed.layerId, parsed.filter)
    }

    try {
      const tile = await renderer.render(param.x, param.y, param.z, { tileSize: query.tileSize as 256 | 512 })
      if (originalLayerId != null) {
        renderer.map.setFilter(originalLayerId, originalLayerFilter)
      }

      if (tile == null) {
        return c.text("Tile not found", 404)
      }

      const imageSharp = sharp(tile, {
        raw: {
          premultiplied: true,
          width: query.tileSize,
          height: query.tileSize,
          channels: 4,
        },
      })

      if (param.z === 0 && query.tileSize === 256) {
        imageSharp.resize(query.tileSize, query.tileSize)
      }

      const image = await imageSharp.toFormat(query.format)
        .toBuffer()

      await renderedCache.set(cacheKey, image)

      return c.body(image, 200, {
        "content-type": `image/${query.format}`,
      })
    }
    catch (e) {
      throw new HTTPException(500, { message: "Failed render" })
    }
    finally {
      pool.release(renderer)
    }
  })

  return app
}
