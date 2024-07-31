import { unzipSync } from "node:zlib"
import { Buffer } from "node:buffer"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import SphericalMercator from "@mapbox/sphericalmercator"
import type { MapMode } from "@maplibre/maplibre-gl-native"
import mlgl from "@maplibre/maplibre-gl-native"
import { ProviderRepository } from "../providers/repository"
import { createEmptyResponse } from "../utils/createEmptyResponse"

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
          try {
            const data = await (await fetch(url)).arrayBuffer()

            return cb(undefined, { data: Buffer.from(data) })
          }
          catch (e) {
            return cb(e as Error)
          }
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

  refreshRenderer() {
    this.map.release()
    this.map = this.initMap()
  }

  destroy() {
    this.map.release()
  }
}

export interface RenderOptions {
  tileSize?: 256 | 512
  margin?: number
}
