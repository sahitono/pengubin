import type { TileJSON } from "../types"
import type { Config } from "../config"
import { MBTiles } from "./mbtiles"
import type { PostgisProviderParam } from "./postgis"
import { Postgis } from "./postgis"
import type { Providers } from "./index"

export interface ProviderInfo<P> {
  provider: P
  path: string
  tileJSON: TileJSON
}

export class ProviderRepository<P extends Providers = Providers> {
  private repo = new Map<string, ProviderInfo<P>>()

  constructor() {
  }

  async init(providers: Config["providers"]) {
    for (const name of Object.keys(providers)) {
      const type = providers[name].type.toLowerCase()
      let provider: P
      if (type === "mbtiles") {
        provider = new MBTiles(providers[name].url) as P
      }
      else if (type === "postgis") {
        provider = new Postgis(providers[name] as unknown as PostgisProviderParam) as P
      }
      else {
        throw new Error(`unsupported provider = ${type}`)
      }

      await provider.init()

      const metadata = await provider.getMetadata()
      this.repo.set(name, {
        provider,
        path: providers[name].url,
        tileJSON: {
          ...metadata,
          version: JSON.stringify(metadata.version),
          tilejson: "2.0.0",
          bounds: metadata.bounds,
          tiles: [`/${name}/{z}/{x}/{y}`],
          /**
           * override to use XYZ scheme by default
           * because TMS scheme will be handled by db query
           */
          scheme: "xyz",
        },
      })
    }
  }

  get(name: string): ProviderInfo<P> {
    const found = this.repo.get(name)
    if (found == null) {
      throw new Error("MBTiles not found")
    }

    return found!
  }

  async add(name: string, provider: P): Promise<void> {
    const metadata = await provider.getMetadata()
    this.repo.set(name, {
      provider,
      path: "",
      tileJSON: {
        ...metadata,
        version: JSON.stringify(metadata.version),
        tilejson: "2.0.0",
        bounds: metadata.bounds,
        tiles: [`/${name}/{z}/{x}/{y}`],
      },
    })
  }

  async remove(name: string): Promise<void> {
    await this.get(name).provider.close()
    this.repo.delete(name)
  }

  async clear(): Promise<void> {
    for (const r of this.repo.keys()) {
      await this.repo.get(r)?.provider.close()
      await this.remove(r)
    }
  }

  keys(): IterableIterator<string> {
    return this.repo.keys()
  }
}
