import * as process from "node:process"
import { Buffer } from "node:buffer"
import { gzipSync } from "node:zlib"
import { cluster } from "radash"
import * as cliProgress from "cli-progress"
import type { PostgisProviderParam } from "../../providers/postgis"
import { Postgis } from "../../providers/postgis"
import { createMBTiles } from "../../providers/mbtiles/createMBTiles"
import { bboxToXYZTiles } from "./lib"

interface RenderParam {
  postgis: PostgisProviderParam
  mbtile: string
  bbox: [number, number, number, number]
  concurrency: number
  minzoom: number
  maxzoom: number
}

async function startRender(param: RenderParam) {
  console.log("Starting Render")

  const db = await createMBTiles(param.mbtile)
  const dbSource = new Postgis(param.postgis)
  await dbSource.init()

  const tiles = bboxToXYZTiles(...param.bbox, param.minzoom, param.maxzoom)

  const clustered = cluster(tiles, param.concurrency)
  let generated = 0
  const progressBar = new cliProgress.SingleBar({
    hideCursor: true,
  })
  progressBar.start(tiles.length, 0)
  for await (const cluster of clustered) {
    await Promise.allSettled(cluster.map(async (tile) => {
      let tiled = await dbSource.getTile(tile.x, tile.y, tile.zoom)

      if (tiled == null) {
        tiled = Buffer.alloc(0)
      }

      await db.updateTile(tile.x, tile.y, tile.zoom, gzipSync(tiled))
    }))

    generated += cluster.length
    progressBar.update(generated)
  }

  await dbSource.close()

  await db.setMetadata({
    maxzoom: param.maxzoom,
    minzoom: param.minzoom,
    name: param.postgis.table,
    format: "pbf",
    bounds: param.bbox,
  })
  await db.close()
}

startRender({
  maxzoom: 10,
  minzoom: 0,
  bbox: [106.479, -6.37258, 106.973, -5.76946],
  concurrency: 6,
  postgis: {
    url: "postgres://postgres:9918@localhost:5437/badung",
    table: "bidang_pbb_4326",
    geomField: "geom",
    idField: "fid",
    srid: 4326,
    schema: "public",
  },
  mbtile: "D:/Documents/00-self-project/ubin-server/test-cache.mbtiles",
})
  .then(() => {
    console.log("\n")
    console.log("Wohooo")
    process.exit(0)
  })
  .catch((e) => {
    console.log("Shit!")
    console.error(e)
  })
