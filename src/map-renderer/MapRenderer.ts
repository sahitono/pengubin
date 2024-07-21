import { unzipSync } from "node:zlib"
import { Buffer } from "node:buffer"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import SphericalMercator from "@mapbox/sphericalmercator"
import type { MapMode } from "@maplibre/maplibre-gl-native"
import mlgl from "@maplibre/maplibre-gl-native"
import colorParse from "color-parse"
import sharp from "sharp"
import { ProviderRepository } from "../providers/repository"

const mercator = new SphericalMercator()
const localProviders = ["provider", "mbtiles"]

export class MapRenderer {
  providerRepo = new ProviderRepository()
  style: StyleSpecification
  public map: mlgl.Map

  constructor(style: StyleSpecification, providerRepo?: ProviderRepository) {
    this.style = style

    if (providerRepo != null) {
      this.providerRepo = providerRepo
    }

    this.map = this.initMap()
  }

  private initMap() {
    const mgl = new mlgl.Map({
      mode: "tile" as MapMode,
      ratio: 1,
      request: async ({
        url,
        kind,
      }, cb) => {
        const isLocalProviders = localProviders.includes(url.split(":")[0])

        if (!isLocalProviders) {
          const data = await (await fetch(url)).arrayBuffer()

          return cb(undefined, { data: Buffer.from(data) })
        }

        const parts = url.split("/")
        const sourceId = parts[2]
        const z = Number.parseInt(parts[3])
        const x = Number.parseInt(parts[4])
        const y = Number.parseInt(parts[5].split(".")[0])

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

  async render(x: number, y: number, z: number, {
    tileSize,
  }: RenderOptions): Promise<Uint8Array> {
    const center = mercator.ll([
      ((x + 0.5) / (2 ** z)) * (256 * (2 ** z)),
      ((y + 0.5) / (2 ** z)) * (256 * (2 ** z)),
    ], z)

    let zoom = z
    if (tileSize !== 512) {
      zoom = z - 1
    }

    const renderOptions: mlgl.RenderOptions = {
      ...(z === 0 && tileSize === 256
        ? {
            width: tileSize * 2,
            height: tileSize * 2,
          }
        : {
            width: tileSize,
            height: tileSize,
          }),
      center,
      zoom,
    }

    return new Promise((resolve, reject) => {
      this.map.render(renderOptions, (err, data) => {
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

export interface RenderOptions {
  tileSize?: 256 | 512
  margin?: number
}
