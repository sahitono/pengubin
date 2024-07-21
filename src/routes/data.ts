import { unzipSync } from "node:zlib"
import { Hono } from "hono"
import { z } from "zod"
import { zValidator } from "@hono/zod-validator"
import { HTTPException } from "hono/http-exception"
import { get } from "radash"
import type { Repository } from "../repository"
import { cache } from "../middleware/cache"
import { DataContentType } from "../constants/DataContentType"
import { XYZParamValidator } from "../middleware/validator"

export async function apiData({ data }: Repository) {
  const app = new Hono()

  app.get("/data/:name", zValidator("param", z.object({ name: z.string().min(5) })), async (c) => {
    const param = c.req.valid("param")
    const tileJSON = data.get(param.name).tileJSON

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

  app.get("/data/:name/:z/:x/:y", XYZParamValidator, await cache(), async (c, _next) => {
    const param = c.req.valid("param")

    const provider = data.get(param.name).provider
    const tile = await provider.getTile(param.x, param.y, param.z)
    if (tile == null) {
      throw new HTTPException(404, { message: "Tile not found" })
    }

    c.header("content-type", DataContentType[provider.format])

    try {
      const uTile = unzipSync(tile)
      return c.body(uTile, 200)
    }
    catch (e) {
      return c.body(tile, 200)
    }
  })

  return app
}
