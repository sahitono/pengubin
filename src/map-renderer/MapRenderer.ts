import { unzipSync } from "node:zlib"
import { Buffer } from "node:buffer"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import SphericalMercator from "@mapbox/sphericalmercator"
import type { MapMode } from "@maplibre/maplibre-gl-native"
import mlgl from "@maplibre/maplibre-gl-native"
import colorParse from "color-parse"
import sharp from "sharp"
import { ProviderRepository } from "../providers/repository"
import type { Config } from "../config"
import { MBTiles } from "../providers/mbtiles"

const mercator = new SphericalMercator()
const possibleMbtile = ["raster", "vector"]

export class MapRenderer {
  providerRepo = new ProviderRepository()
  style: StyleSpecification
  public map: mlgl.Map

  constructor(style: StyleSpecification, providers?: Config["providers"], providerRepo?: ProviderRepository) {
    this.style = style
    if (providers != null) {
      this.initRepo(providers)
    }

    if (providerRepo != null) {
      this.providerRepo = providerRepo
    }

    this.map = this.initMap()
  }

  private initRepo(providers: Config["providers"]) {
    for (const name of Object.keys(providers)) {
      this.providerRepo.add(name, new MBTiles(providers[name]))
    }
  }

  private initMap() {
    const mgl = new mlgl.Map({
      mode: "tile" as MapMode,
      ratio: 1,
      request: async ({
        url,
        kind,
      }, cb) => {
        const isLocalMBTile = url.split(":")[0] === "mbtiles"

        if (!isLocalMBTile) {
          const data = await (await fetch(url)).arrayBuffer()

          return cb(undefined, { data: Buffer.from(data) })
        }

        const parts = url.split("/")
        const sourceId = parts[2]
        const z = Number.parseInt(parts[3])
        const x = Number.parseInt(parts[4])
        const y = Number.parseInt(parts[5].split(".")[0])
        // console.log(z, x, y)

        const tile = await this.providerRepo.get(sourceId).provider.getTile(x, y, z)

        if (tile == null) {
          cb(undefined, { data: await createEmptyResponse("pbf") })
          return
        }
        try {
          const data = unzipSync(tile)
          cb(undefined, { data })
        }
        catch {
          cb(undefined, { data: tile })
        }
      },
    })
    mgl.load(this.style)
    return mgl
  }

  async render(x: number, y: number, z: number): Promise<Uint8Array> {
    const center = mercator.ll([
      ((x + 0.5) / (2 ** z)) * (256 * (2 ** z)),
      ((y + 0.5) / (2 ** z)) * (256 * (2 ** z)),
    ], z)

    return new Promise((resolve, reject) => {
      this.map.render({
        height: 512,
        center,
        zoom: z,
        width: 512,
      }, (err, data) => {
        if (err != null || data == null) {
          return reject(err)
        }

        return resolve(data)
      })
    })
  }

  destroy() {
    this.map.release()
  }
}

// MapRenderer.prototype.equals = ()

const cachedEmptyResponses: Record<string, Uint8Array> = {
  "": Buffer.alloc(0),
}
async function createEmptyResponse(format: "pbf" | "jpg" | "jpeg" | "png", color: string = "rgba(255,255,255,0)"): Promise<Uint8Array> {
  if (!format || format === "pbf") {
    return cachedEmptyResponses[""]
  }

  if (format === "jpg") {
    format = "jpeg"
  }

  const cacheKey = `${format},${color}`
  const data = cachedEmptyResponses[cacheKey]
  if (data) {
    return data
  }

  // create an "empty" response image
  const parsed = colorParse(color)
  const array = parsed.values
  const channels = array.length === 4 && format !== "jpeg" ? 4 : 3
  return await sharp(Buffer.from(array), {
    raw: {
      width: 1,
      height: 1,
      channels,
    },
  })
    .toFormat(format)
    .toBuffer()
}
