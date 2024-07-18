import { Hono } from "hono"
import { get } from "radash"
import type { Repository } from "../repository"
import type { MBTiles } from "../providers/mbtiles"
import type { ProviderInfo } from "../providers/repository"
import { DataContentType } from "../constants/DataContentType"

export async function apiCatalog({ data, style }: Repository) {
  const app = new Hono()

  app.get("/catalog", async (c) => {
    const dataInfo: Record<string, Record<string, unknown>> = {}

    const hostUrl = c.req.url.replaceAll("/catalog", "")
    for await (const dataKey of data.keys()) {
      const content = data.get(dataKey) as ProviderInfo<MBTiles>

      dataInfo[dataKey] = {
        path: `${hostUrl}/data/${dataKey}`,
        name: content.tileJSON.name ?? dataKey,
        description: content.tileJSON?.description,
        content_type: DataContentType[get<string>(content.tileJSON, "format")],
      }
    }

    const styleInfo: Record<string, string> = {}
    for await (const styleKey of style.keys()) {
      styleInfo[styleKey] = `${hostUrl}/style/${styleKey}`
    }

    return c.json({
      data: dataInfo,
      style: styleInfo,
    })
  })

  return app
}
