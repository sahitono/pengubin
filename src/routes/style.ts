import type { Buffer } from "node:buffer"
import path from "node:path"
import destr from "destr"
import { get } from "radash"
import sharp from "sharp"
import { caching } from "cache-manager"
import { Type } from "@sinclair/typebox"
import { badGateway, notFound } from "@hapi/boom"
import { sqliteImageStore } from "../repository/cache/sqlite-image"
import type { FastifyTypeBoxInstance } from "../createServer"
import { XYZParam } from "../utils/validator"

const Query = Type.Object({
  // format: Type.Union([
  //   Type.Literal("png"),
  //   Type.Literal("jpeg"),
  //   Type.Literal("webp"),
  // ], {
  //   default: Type.Literal("png"),
  // }),
  format: Type.Unsafe<"png" | "jpeg" | "webp">({
    default: "png",
  }),
  tileSize: Type.Number({
    default: 512,
  }),
  filter: Type.Optional(Type.String()),
})

interface FilterLayer {
  layerId: string
  filter: []
}

const Param = Type.Object({
  name: Type.String(),
})

const XYZParamWithFormat = Type.Object({
  name: Type.String(),
  x: Type.Number({
    minimum: 0,
  }),
  y: Type.Number({
    minimum: 0,
  }),
  z: Type.Number({
    minimum: 0,
    maximum: 23,
  }),
  format: Type.Union([
    Type.Literal("png"),
    Type.Literal("jpeg"),
    Type.Literal("webp"),
  ], {
    default: Type.Literal("png"),
  }),
})

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Release dangling style renderer on client abort connection
     */
    releaseDanglingRendererPool: () => void
  }
}

export async function apiStyle(server: FastifyTypeBoxInstance) {
  const {
    config,
    style,
  } = server.repo
  server.decorateRequest("releaseDanglingRendererPool", () => null)
  server.addHook("onRequest", async (req) => {
    req.raw.on("close", () => {
      if (req.raw.destroyed) {
        req.releaseDanglingRendererPool()
      }
    })
  })

  const renderedCache = await caching(sqliteImageStore({
    cacheTableName: "caches",
    enableWALMode: true,
    sqliteFile: path.resolve(config.options.cache.directory, "cached-image.sqlite3"),
    ttl: config.options.cache.ttl,
  }))

  server.get("/style/:name", {
    schema: {
      params: Param,
    },
  }, async (req, res) => {
    const param = req.params
    const tileJSON = style.get(param.name)?.tileJSON
    if (tileJSON == null) {
      throw notFound("Style not found")
    }

    return res.send({
      ...tileJSON,
      ...(Object.hasOwn(tileJSON, "json")
        ? {
            ...get<Record<string, any>>(tileJSON, "json"),
            json: undefined,
          }
        : {}),
      tiles: [`${req.hostname}${req.url}/{z}/{x}/{y}`],
    })
  })

  server.get("/style/:name/:z/:x/:y", {
    schema: {
      params: XYZParam,
      querystring: Query,
    },
  }, async (req, reply) => {
    const param = req.params
    const query = req.query

    const cacheKey = req.url
    const cached = await renderedCache.get<Buffer>(cacheKey)
    if (cached != null) {
      reply.header("content-type", `image/${query.format}`)
      return reply.send(cached).status(200)
    }

    const pool = style.get(param.name)?.pool
    if (pool == null) {
      throw notFound("Style not found")
    }

    const renderer = await pool.acquire().promise
    let originalLayerFilter: [] | undefined
    let originalLayerId: string | undefined
    if (query.filter != null) {
      const parsed = destr<FilterLayer[]>(query.filter)[0]
      if (parsed.layerId == null) {
        pool.release(renderer)
        throw notFound("Missing layer ID in filter")
      }

      const originalLayer = renderer.style.layers.find(f => f.id === parsed.layerId)
      originalLayerFilter = get(originalLayer, "filter")
      originalLayerId = parsed.layerId
      renderer.map.setFilter(parsed.layerId, parsed.filter)
    }
    let rendererReleased = false
    const releaseRendererPool = () => {
      if (originalLayerId != null) {
        renderer.map.setFilter(originalLayerId, originalLayerFilter)
      }
      pool.release(renderer)
      rendererReleased = true
      req.releaseDanglingRendererPool = () => null
    }
    req.releaseDanglingRendererPool = releaseRendererPool

    try {
      const tile = await renderer.render(param.x, param.y, param.z, { tileSize: query.tileSize as 256 | 512 })
      releaseRendererPool()

      if (tile == null) {
        return reply.send("Tile not found").status(404)
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

      const image = await imageSharp.toFormat(query.format!)
        .toBuffer()

      await renderedCache.set(cacheKey, image)

      reply.header("content-type", `image/${query.format}`)
      return reply.send(image)
    }
    catch (e) {
      server.log.debug(e)
      throw badGateway("Failed render")
    }
    finally {
      if (!rendererReleased) {
        releaseRendererPool()
      }
    }
  })
}
