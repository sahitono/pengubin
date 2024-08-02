import postgres from "postgres"
import { get, objectify } from "radash"
import type { XYZProvider, XYZProviderMetadata } from "@pengubin/core"

export interface PostgresTableParam {
  url: string
  table: string
}

export class PostgresTable implements XYZProvider {
  type = "postgres-table"
  format: string = "pbf"
  private readonly url: string
  private readonly table: string
  protected initialized: boolean = false
  readonly metadataTable: string
  readonly db: postgres.Sql

  static async create(param: PostgresTableParam): Promise<PostgresTable> {
    const db = postgres(param.url)
    const metadata = `${param.table}_metadata`
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS ${param.table}
      (
        zoom_level  INTEGER,
        tile_column INTEGER,
        tile_row    INTEGER,
        tile_data   bytea
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ${`${param.table}_index`} ON
        ${param.table} (zoom_level, tile_column, tile_row);

      CREATE TABLE IF NOT EXISTS ${metadata}
      (
        name  TEXT,
        value TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ${metadata}_index
        ON ${metadata} (name);
    `)
      .execute()

    await db.end()
    return new PostgresTable(param)
  }

  constructor(param: PostgresTableParam) {
    this.url = param.url
    this.table = param.url
    this.db = postgres(this.url)
    this.metadataTable = `${this.table}_metadata`
  }

  async init(): Promise<void> {
    const format = await this.db`
      SELECT value
      FROM metadata
      WHERE name = 'format'
    `.execute()
    this.format = get(format, "[0].value", "pbf")
    this.initialized = true
  }

  async close(): Promise<void> {
    await this.db.end()
  }

  async getMetadata(): Promise<XYZProviderMetadata> {
    const meta = await this.db`SELECT *
                               FROM ${this.db(this.metadataTable)}`
    return objectify(meta, m => m.name, m => m.value) as XYZProviderMetadata
  }

  async getTile(x: number, y: number, z: number): Promise<Uint8Array | undefined> {
    const tile = await this.db`
      SELECT zoom_level, tile_column, tile_row, tile_data
      FROM ${this.db(this.table)}
      WHERE zoom_level = ${z}
        AND tile_column = ${x}
        AND tile_row = ${y}
    `.execute()

    if (tile.length === 0) {
      return
    }

    return get(tile, "[0].tile_data")
  }

  async setMetadata(metadata: XYZProviderMetadata): Promise<void> {
    await this.db.begin(async (sql) => {
      for (const [key, value] of Object.entries(metadata)) {
        const strValue = JSON.stringify(value)
        await sql`
          INSERT INTO ${this.db(this.metadataTable)} (name, value)
          VALUES (${key}, ${strValue})
          ON CONFLICT DO UPDATE SET name  = ${key},
                                    value = ${strValue}
        `.execute()
      }
    })
  }

  async updateTile(x: number, y: number, z: number, tile: Uint8Array): Promise<void> {
    await this.db.begin(async (sql) => {
      await sql`
        INSERT
        INTO ${this.db(this.table)} (zoom_level, tile_column, tile_row, tile_data)
        ON CONFLICT(zoom_level, tile_column, tile_row)
          DO UPDATE SET zoom_level  = ${z},
                        tile_column = ${x},
                        tile_row    = ${y},
                        tile_data   = ${tile}
      `.execute()
    })
  }
}
