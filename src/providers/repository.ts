import type { Bounds, TileJSON } from "../types"
import { MBTiles } from "./mbtiles"
import type { Provider } from "./interface"

export interface ProviderInfo<P> {
  provider: P
  path: string
  tileJSON: TileJSON
}

export class ProviderRepository<P extends MBTiles | Provider = MBTiles | Provider> {
  private repo = new Map<string, ProviderInfo<P>>()

  constructor(providers?: Record<string, string>) {
    if (providers == null) {
      return
    }

    for (const name of Object.keys(providers)) {
      const provider = new MBTiles(providers[name]) as P
      const metadata = (provider as MBTiles).getMetadata()
      this.repo.set(name, {
        provider,
        path: providers[name],
        tileJSON: {
          ...metadata,
          tilejson: "2.0.0",
          bounds: metadata.bounds.split(",").map(n => Number.parseFloat(n)) as Bounds,
          tiles: [`/${name}/{z}/{x}/{y}`],
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

  add(name: string, provider: P): void {
    const metadata = (provider as MBTiles).getMetadata()
    this.repo.set(name, {
      provider,
      path: "",
      tileJSON: {
        ...metadata,
        tilejson: "2.0.0",
        bounds: metadata.bounds.split(",").map(n => Number.parseFloat(n)) as Bounds,
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
      await this.remove(r)
    }
  }

  keys(): IterableIterator<string> {
    return this.repo.keys()
  }
}
