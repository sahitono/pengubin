import postgres from "postgres"
import pg from "pg"

import type { Provider, ProviderMetadata } from "../interface"

export interface PostgisProviderParam {
  url: string
  table: string
  geomField?: string
  idField?: string
  srid?: number
  schema?: string
}

interface PGTableInfo {
  column_name: string
}

export class Postgis implements Provider {
  type = "postgis"
  readonly url: string
  readonly table: string
  readonly geomField: string
  readonly idField: string
  readonly srid: number
  readonly db: postgres.Sql
  readonly pool: pg.Pool
  readonly schema: string
  protected columns: string[] = []

  constructor(param: PostgisProviderParam) {
    this.url = param.url
    this.table = param.table
    this.geomField = param.geomField ?? "geom"
    this.idField = param.idField ?? "id"
    this.srid = param.srid ?? 4326
    this.schema = param.schema ?? "public"
    this.db = postgres(this.url, {
      debug: true,
    })

    this.pool = new pg.Pool({
      connectionString: this.url,
    })
  }

  async init() {
    const rows = await this.db<PGTableInfo[]>`SELECT *
                                              FROM information_schema.columns
                                              WHERE table_schema = 'public'
                                                AND table_name = ${this.table};
    `.execute()

    this.columns = rows
      .map(row => row.column_name)
      .filter(col => col !== this.geomField)
  }

  async getTile(x: number, y: number, z: number): Promise<Uint8Array | undefined> {
    const sqlText = `
      SELECT ST_AsMVT(tile, $1, 4096, $2, $3)
      FROM (SELECT ST_AsMVTGeom(
                     ST_Transform(ST_CurveToLine("${this.geomField}"), 3857),
                     ST_TileEnvelope($4, $5, $6),
                     4096, 64, true
                   ) AS geom
              ${this.columns.map(c => `,"${c}"`).join("")}
            FROM "${this.schema}"."${this.table}"
            WHERE "${this.geomField}" && ST_Transform(ST_TileEnvelope($4, $5, $6), ${this.srid})) AS tile
    `

    const query = this.pool.query(sqlText, [this.table, this.geomField, this.idField, z, x, y])
    const res = await query
    if (res.rowCount == null || res.rowCount === 0) {
      return
    }

    return res.rows[0].st_asmvt
  }

  async updateTile(_x: number, _y: number, _z: number, _tile: Uint8Array): Promise<void> {}

  async close(): Promise<void> {
    await Promise.all([
      this.pool.end(),
      this.db.end(),
    ])
  }

  private async getExtent(): Promise<[number, number, number, number]> {
    const rows = await this.db<{
      xmin: number
      xmax: number
      ymin: number
      ymax: number
    }[]>`
      SELECT st_xmin(extent.table_extent) xmin,
             st_ymin(extent.table_extent) ymin,
             st_xmax(extent.table_extent) xmax,
             st_ymax(extent.table_extent) ymax
      FROM (SELECT st_transform(ST_SetSRID(ST_Extent(${this.db(this.geomField)}), ${this.srid}), 4326) as table_extent
            FROM ${this.db(this.table)}) extent
    `.execute()

    return [rows[0].xmin, rows[0].ymin, rows[0].xmax, rows[0].ymax]
  }

  async getMetadata(): Promise<ProviderMetadata> {
    const bounds = await this.getExtent()

    return {
      maxzoom: 20,
      minzoom: 0,
      name: this.table,
      format: "pbf",
      bounds,
    }
  }

  async setMetadata(_metadata: ProviderMetadata): Promise<void> {}
}
