import { createMBTiles } from "@pengubin/provider-mbtiles"
import type { WebXYZProviderParam } from "@pengubin/provider-web"
import { WebXYZ } from "@pengubin/provider-web"
import consola from "consola"
import { cluster } from "radash"
import * as cliProgress from "cli-progress"
import sharp from "sharp"
import { bboxToXYZTiles } from "../tiler/lib"

export interface Web2MBTilesParam extends WebXYZProviderParam {
  target: string
  concurrency: number
  tileSize: number
}

export async function start(param: Web2MBTilesParam) {
  const web = new WebXYZ(param)
  const mbtiles = await createMBTiles(param.target)

  const tiles = bboxToXYZTiles(...web.bounds, web.minZoom, web.maxZoom)
  consola.info(`${tiles.length} tiles will be created`)

  const clustered = cluster(tiles, param.concurrency)
  let generated = 0
  let missing = 0
  const progressBar = new cliProgress.SingleBar({
    hideCursor: true,
  })
  progressBar.start(tiles.length, 0)

  const emptyPng = await sharp({
    create: {
      width: param.tileSize,
      height: param.tileSize,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    },
  }).png().toBuffer()
  for await (const cluster of clustered) {
    await Promise.all(cluster.map(async (tile) => {
      let tiled = await web.getTile(tile.x, tile.y, tile.zoom)

      if (tiled == null) {
        missing += 1
        consola.debug(`Missing tile ${tile.x}, ${tile.y}, ${tile.zoom}`)
        tiled = emptyPng
      }

      await mbtiles.updateTile(tile.x, tile.y, tile.zoom, tiled)
    }))

    generated += cluster.length
    progressBar.update(generated)
    // consola.warn(`Missing tile ${missing} / ${generated}`)
  }

  consola.info("\nWriting metadata...")
  const minzoom = mbtiles.db.prepare<[], { z: number }>("SELECT MIN(t.zoom_level) z FROM  tiles t").get()?.z ?? web.minZoom
  const maxzoom = mbtiles.db.prepare<[], { z: number }>("SELECT MAX(t.zoom_level) z FROM  tiles t").get()?.z ?? web.maxZoom
  await mbtiles.setMetadata({
    maxzoom,
    minzoom,
    name: web.url,
    description: `Generated by pengubin from ${web.url} at ${Date.now()}`,
    format: web.format,
    bounds: web.bounds,
    type: "baselayer",
  })

  consola.info("Finished !")
  await mbtiles.close()
}
