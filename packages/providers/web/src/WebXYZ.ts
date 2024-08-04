import type { Bounds, XYZProvider, XYZProviderMetadata } from "@pengubin/core"
import ky from "ky"

export interface WebXYZProviderParam {
  url: string
  minZoom?: number
  maxZoom?: number
  bounds?: Bounds
  format?: string
}

export class WebXYZ implements XYZProvider {
  type = "web-xyz" as const
  readonly format: string = "png"
  readonly url: string
  readonly minZoom: number
  readonly maxZoom: number
  readonly bounds: Bounds

  constructor(param: WebXYZProviderParam) {
    this.url = param.url
    this.format = param.format ?? "png"
    this.minZoom = param.minZoom ?? 0
    this.maxZoom = param.maxZoom ?? 20
    this.bounds = param.bounds ?? [-90, -180, 90, 180]
  }

  async getMetadata(): Promise<XYZProviderMetadata> {
    return {
      minzoom: this.minZoom,
      maxzoom: this.maxZoom,
      bounds: this.bounds,
      name: this.url,
      format: this.format,
    }
  }

  close(): Promise<void> {
    return Promise.resolve(undefined)
  }

  async getTile(x: number, y: number, z: number): Promise<Uint8Array | undefined> {
    const url = this.url.replace("{x}", String(x)).replace("{y}", String(y)).replace("{z}", String(z))
    try {
      const data = await ky.get(url).arrayBuffer()
      return new Uint8Array(data)
    }
    catch (e) {
      return undefined
    }
  }

  init(): Promise<void> {
    return Promise.resolve(undefined)
  }

  setMetadata(_metadata: XYZProviderMetadata): Promise<void> {
    throw new Error("not supported")
  }

  updateTile(_x: number, _y: number, _z: number, _tile: Uint8Array): Promise<void> {
    throw new Error("not supported")
  }
}
