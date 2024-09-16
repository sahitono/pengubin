import { get } from "radash"
import type { FastifyInstance } from "fastify"
import type { MBTiles } from "@pengubin/provider-mbtiles"
import type { ProviderInfo } from "../providers/repository"
import { DataContentType } from "../constants/DataContentType"

export async function apiCatalog(server: FastifyInstance) {
  server.get("/catalog", {
    onRequest: server.auth([
      server.verifyJWT,
    ]),
  }, async (req, res) => {
    const dataInfo: Record<string, Record<string, unknown>> = {}

    const hostUrl = `${req.protocol}://${req.hostname}${req.url.replaceAll("/catalog", "")}`

    for await (const dataKey of server.repo.data.keys()) {
      const content = server.repo.data.get(dataKey) as ProviderInfo<MBTiles>

      dataInfo[dataKey] = {
        path: `${hostUrl}/data/${dataKey}`,
        name: content.tileJSON.name ?? dataKey,
        description: content.tileJSON?.description,
        content_type: DataContentType[get<string>(content.tileJSON, "format")],
      }
    }

    const styleInfo: Record<string, string> = {}
    for await (const styleKey of server.repo.style.keys()) {
      styleInfo[styleKey] = `${hostUrl}/style/${styleKey}`
    }

    const spriteInfo: Record<string, string> = {}
    for await (const spriteKey of server.repo.sprite.keys()) {
      if (spriteKey === "default") {
        spriteInfo[spriteKey] = `${hostUrl}/sprite`
        continue
      }
      spriteInfo[spriteKey] = `${hostUrl}/sprite/${spriteKey}`
    }

    return res.send({
      data: dataInfo,
      style: styleInfo,
      sprite: spriteInfo,
    })
  })
}
