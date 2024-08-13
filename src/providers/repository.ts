import { MBTiles } from "@pengubin/provider-mbtiles"
import { Postgis } from "@pengubin/provider-postgis"
import type { PostgresTableParam } from "@pengubin/provider-postgres-table"
import { PostgresTable } from "@pengubin/provider-postgres-table"
import type { DatabasePool } from "slonik"
import Sqlite from "better-sqlite3"
import { createPool } from "slonik"
import type { PostgisProviderParam } from "@pengubin/provider-postgis"
import type { TileJSON } from "../types"
import type { Config } from "../config"
import type { Providers } from "./index"

export interface ProviderInfo<P> {
  provider: P
  path: string
  tileJSON: TileJSON
}

export class ProviderRepository<P extends Providers = Providers> {
  private repo = new Map<string, ProviderInfo<P>>()
  private poolCache = new Map<string, DatabasePool | Sqlite.Database>()

  constructor() {
  }

  private async getOrCreate(url: string): Promise<DatabasePool | Sqlite.Database> {
    if (this.poolCache.has(url)) {
      return this.poolCache.get(url)!
    }

    const pool = !url.includes("postgresql") ? new Sqlite(url) : await createPool(url)

    this.poolCache.set(url, pool)
    return pool
  }

  async init(providers: Config["providers"]) {
    for (const name of Object.keys(providers)) {
      const type = providers[name].type.toLowerCase() as P["type"]
      let provider: P

      if (type === "mbtiles") {
        provider = new MBTiles(providers[name].url) as P
      }
      else if (type === "postgis") {
        const config = providers[name] as unknown as PostgisProviderParam
        const pool = await this.getOrCreate(config.url!) as DatabasePool
        provider = new Postgis({
          ...config,
          pool,
        }) as P
      }
      else if (type === "postgres-table") {
        provider = new PostgresTable(providers[name] as unknown as PostgresTableParam) as P
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
      throw new Error("Provider not found")
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
