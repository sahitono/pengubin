import { get } from "radash"
import type { FastifyInstance } from "fastify"
import type { MBTiles } from "../providers/mbtiles"
import type { ProviderInfo } from "../providers/repository"
import { DataContentType } from "../constants/DataContentType"

export async function apiCatalog(server: FastifyInstance) {
  server.get("/catalog", async (req, res) => {
    const dataInfo: Record<string, Record<string, unknown>> = {}

    const hostUrl = `${req.hostname}${req.url.replaceAll("/catalog", "")}`

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

    return res.send({
      data: dataInfo,
      style: styleInfo,
    })
  })
}
