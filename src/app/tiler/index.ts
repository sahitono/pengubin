import * as process from "node:process"
import { Buffer } from "node:buffer"
import { gzipSync } from "node:zlib"
import { cluster, objectify } from "radash"
import * as cliProgress from "cli-progress"
import consola from "consola"
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
  consola.info("Start tiling")

  const db = await createMBTiles(param.mbtile)
  const dbSource = new Postgis(param.postgis)
  await dbSource.init()
  if (param.postgis.idField && dbSource.columns.findIndex(f => f.name === param.postgis.idField) === -1) {
    consola.error(`Column "${param.postgis.idField}" not exist on table`)
    process.exit(0)
  }

  const tiles = bboxToXYZTiles(...param.bbox, param.minzoom, param.maxzoom)
  consola.info(`${tiles.length} tiles will be created`)

  const clustered = cluster(tiles, param.concurrency)
  let generated = 0
  const progressBar = new cliProgress.SingleBar({
    hideCursor: true,
  })
  progressBar.start(tiles.length, 0)
  for await (const cluster of clustered) {
    await Promise.all(cluster.map(async (tile) => {
      let tiled = await dbSource.getTile(tile.x, tile.y, tile.zoom)

      if (tiled == null) {
        consola.error(`Shit tile is null = ${tile.x}, ${tile.y}, ${tile.zoom}`)
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
    description: `Generated by pengubin from ${param.postgis.table} at ${Date.now()}`,
    format: "pbf",
    bounds: param.bbox,
    json: {
      vector_layers: [
        {
          id: param.postgis.table,
          minzoom: String(param.minzoom),
          maxzoom: String(param.maxzoom),
          fields: objectify(dbSource.columns, col => col.name, col => col.type),
        },
      ],
    },
  })
  await db.close()
}

startRender({
  maxzoom: 18,
  minzoom: 0,
  bbox: [106.479, -6.37258, 106.973, -5.76946],
  concurrency: 14,
  postgis: {
    url: "postgres://postgres:9918@localhost:5437/badung",
    table: "bidang_pbb",
    geomField: "geom",
    idField: "id",
    srid: 4326,
    schema: "public",
  },
  mbtile: "D:/Documents/00-self-project/ubin-server/bidang_pbb.mbtiles",
})
  .then(() => {
    console.log("\n")
    consola.success("Finished!")
    process.exit(0)
  })
  .catch((e) => {
    consola.error("Something went wrong!")
    consola.error(e)
  })
