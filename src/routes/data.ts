import { get } from "radash"
import type { Static } from "@sinclair/typebox"
import { Type } from "@sinclair/typebox"
import fastifyCaching from "@fastify/caching"
import { badRequest, notFound } from "@hapi/boom"
import type { Postgis } from "@pengubin/provider-postgis"
import { DataContentType } from "../constants/DataContentType"
import type { XYZParamType } from "../utils/validator"
import { XYZParam } from "../utils/validator"
import type { FastifyTypeBoxInstance } from "../createServer"
import type { ValidFormat } from "../utils/createEmptyResponse"
import { createEmptyResponse } from "../utils/createEmptyResponse"
import { unzipPromise } from "../utils/unzipPromise"

const Param = Type.Object({
  name: Type.String(),
})

type ParamType = Static<typeof Param>

export async function apiData(server: FastifyTypeBoxInstance) {
  const { config } = server.repo
  server.register(
    fastifyCaching,
    {
      expiresIn: config.options.cache.ttl,
      serverExpiresIn: config.options.cache.ttl,
      cacheSegment: "tiles/data",
    },
  )

  server.get<{ Params: ParamType }>("/data/:name", {
    schema: {
      params: Param,
    },
  }, async (req, res) => {
    const tileJSON = server.repo.data.get(req.params.name).tileJSON

    return res.send({
      ...tileJSON,
      ...(Object.hasOwn(tileJSON, "json")
        ? {
            ...get<Record<string, any>>(tileJSON, "json"),
            json: undefined,
          }
        : {}),
      tiles: [`${req.protocol}://${req.hostname}${req.url}/{z}/{x}/{y}`],
    })
  })

  server.get("/data/:name/features", {
    schema: {
      params: Param,
      querystring: Type.Object({
        limit: Type.Number({
          default: 100,
        }),
      }),
    },
  }, async (req, res) => {
    const { provider } = server.repo.data.get(req.params.name)
    if (provider.type !== "postgis") {
      throw badRequest("not supported provider")
    }

    const pg = provider as Postgis

    const rows = await pg.getFeatures(req.query.limit)

    return res.send(rows)
  })

  server.get("/data/:name/features/:id", {
    schema: {
      params: Type.Object({
        id: Type.Number({
          minimum: 0,
        }),
        name: Type.String({
          minLength: 0,
        }),
      }),
    },
  }, async (req, res) => {
    const { provider } = server.repo.data.get(req.params.name)
    if (provider.type !== "postgis") {
      throw badRequest("not supported provider")
    }

    const pg = provider as Postgis

    const rows = await pg.getFeatureByID(req.params.id)
    if (rows == null) {
      throw notFound()
    }

    return res.send(rows)
  })

  server.get<{ Params: XYZParamType }>("/data/:name/:z/:x/:y", {
    schema: {
      params: XYZParam,
    },
  }, async (req, res) => {
    const param = req.params

    const provider = server.repo.data.get(param.name).provider
    const tile = await provider.getTile(param.x, param.y, param.z)

    res.header("content-type", DataContentType[provider.format])
    if (tile == null) {
      const data = await createEmptyResponse(provider.format as ValidFormat)
      return res.send(data)
    }

    try {
      const uTile = await unzipPromise(tile)
      return res.send(uTile)
    }
    catch (e) {
      return res.send(tile)
    }
  })
}
