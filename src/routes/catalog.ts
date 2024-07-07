import { Hono } from "hono"
import { get } from "radash"
import type { Repository } from "../repository"
import type { MBTiles } from "../providers/mbtiles"
import type { ProviderInfo } from "../providers/repository"

export async function apiCatalog({ data, style }: Repository) {
  const app = new Hono()

  app.get("/catalog", async (c) => {
    const dataInfo: Record<string, Record<string, unknown>> = {}
    for await (const dataKey of data.keys()) {
      const content = data.get(dataKey) as ProviderInfo<MBTiles>
      dataInfo[dataKey] = {
        path: `${c.req.url}/data/${dataKey}/{z}/{x}/{y}`,
        name: content.tileJSON.name ?? dataKey,
        description: content.tileJSON?.description,
        content_type: get(content.tileJSON, "format") === "pbf" ? "application/x-protobuf" : "application/json",
      }
    }

    const styleInfo: Record<string, string> = {}
    for await (const styleKey of style.keys()) {
      styleInfo[styleKey] = `${c.req.url}/style/${styleKey}/{z}/{x}/{y}`
    }

    return c.json({
      data: dataInfo,
      style: styleInfo,
    })
  })

  return app
}
