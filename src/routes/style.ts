import path from "node:path"
import destr from "destr"
import { get } from "radash"
import sharp from "sharp"
import { Type } from "@sinclair/typebox"
import { badGateway, notFound } from "@hapi/boom"
import type { FastifyTypeBoxInstance } from "../createServer"
import { ImageCache, SqliteImageStore } from "../repository/cache"

const Query = Type.Object({
  format: Type.Unsafe<"png" | "jpeg" | "webp">({
    default: "png",
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

const XYZParamStyle = Type.Object({
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
  tileSize: Type.Number({ minimum: 256 }),
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

  const renderedCache = new ImageCache({
    ttl: config.options.cache.ttl,
    store: new SqliteImageStore({
      cacheTableName: "caches",
      enableWALMode: true,
      sqliteFile: path.resolve(config.options.cache.directory, "cached-image.sqlite3"),
    }),
  })

  const ParamTileSize = Type.Object({
    name: Type.String(),
    tileSize: Type.Number({ minimum: 256, default: 256 }),
  })
  server.get("/style/:name/:tileSize?", {
    schema: {
      params: ParamTileSize,
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
      tileSize: req.params.tileSize,
      tiles: [`${req.protocol}://${req.hostname}${req.url}/{z}/{x}/{y}`],
    })
  })

  server.get("/style/:name/:tileSize/:z/:x/:y", {
    schema: {
      params: XYZParamStyle,
      querystring: Query,
    },
  }, async (req, reply) => {
    const param = req.params
    const query = req.query

    const cacheOtherKey = `${JSON.stringify(query)}-${param.tileSize}`

    const cached = await renderedCache.get(param.name, param.x, param.y, param.z, cacheOtherKey)
    server.log.info(`found cache for = ${req.url} `)
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
    let rendered = false
    const releaseRendererPool = () => {
      if (originalLayerId != null) {
        renderer.map.setFilter(originalLayerId, originalLayerFilter)
      }
      if (!rendered) {
        renderer.refreshRenderer()
      }
      pool.release(renderer)
      rendererReleased = true
      req.releaseDanglingRendererPool = () => null
    }
    req.releaseDanglingRendererPool = releaseRendererPool

    try {
      const tile = await renderer.render(param.x, param.y, param.z, { tileSize: param.tileSize as 256 | 512 })
      rendered = true
      releaseRendererPool()

      if (tile == null) {
        return reply.send("Tile not found").status(404)
      }

      const imageSharp = sharp(tile, {
        raw: {
          premultiplied: true,
          width: param.tileSize,
          height: param.tileSize,
          channels: 4,
        },
      })

      if (param.z === 0 && param.tileSize === 256) {
        imageSharp.resize(param.tileSize, param.tileSize)
      }

      const image = await imageSharp.toFormat(query.format)
        .toBuffer()

      await renderedCache.set(param.name, param.x, param.y, param.z, image, cacheOtherKey)

      reply.header("content-type", `image/${query.format}`)
      return reply.send(image)
    }
    catch (e) {
      server.log.error(e)
      throw badGateway("Failed render")
    }
    finally {
      if (!rendererReleased) {
        releaseRendererPool()
      }
    }
  })
}
