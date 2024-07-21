import { unzipSync } from "node:zlib"
import { get } from "radash"
import type { Static } from "@sinclair/typebox"
import { Type } from "@sinclair/typebox"
import fastifyCaching from "@fastify/caching"
import { DataContentType } from "../constants/DataContentType"
import type { XYZParamType } from "../utils/validator"
import { XYZParam } from "../utils/validator"
import type { FastifyTypeBoxInstance } from "../createServer"
import type { ValidFormat } from "../utils/createEmptyResponse"
import { createEmptyResponse } from "../utils/createEmptyResponse"

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
      const uTile = unzipSync(tile)
      return res.send(uTile)
    }
    catch (e) {
      return res.send(tile)
    }
  })
}
