import type { DatabasePool } from "slonik"
import { createPool, sql } from "slonik"

import { Pattern, match } from "ts-pattern"
import type { Feature } from "geojson"
import destr from "destr"
import type { XYZMetadataVectorLayerFieldType, XYZProvider, XYZProviderMetadata } from "@pengubin/core"
import { ZPGTableInfo } from "./PGTableInfo"

export interface PostgisProviderParam {
  pool?: DatabasePool
  url?: string
  table: string
  geomField?: string
  idField?: string
  srid?: number
  schema?: string
}

export class Postgis implements XYZProvider {
  type = "postgis" as const
  readonly format: string = "pbf"
  readonly url: string
  readonly table: string
  readonly geomField: string
  readonly idField: string
  readonly srid: number
  protected _pool?: DatabasePool
  readonly schema: string
  columns: {
    name: string
    type: XYZMetadataVectorLayerFieldType
  }[] = []

  constructor(param: PostgisProviderParam) {
    if (param.pool != null) {
      this._pool = param.pool
      this.url = param.pool.configuration.connectionUri
    }
    else {
      if (param.url == null) {
        throw new Error("url missing")
      }
      this.url = param.url
    }

    this.table = param.table
    this.geomField = param.geomField ?? "geom"
    this.idField = param.idField ?? "id"
    this.srid = param.srid ?? 4326
    this.schema = param.schema ?? "public"
  }

  get pool() {
    if (this._pool == null) {
      throw new Error("uninitialized pool")
    }
    return this._pool
  }

  async init() {
    if (this._pool == null) {
      this._pool = await createPool(this.url)
    }

    const res = await this.pool.query(sql.type(ZPGTableInfo)`
      SELECT *
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${this.table}
    `)

    this.columns = res.rows
      .filter(col => col.column_name !== this.geomField)
      .map((row) => {
        const type = match(row.data_type).returnType<XYZMetadataVectorLayerFieldType>()
          .with(Pattern.union("text", "character varying"), () => {
            return "String"
          })
          .otherwise(() => "Number")
        return {
          name: row.column_name,
          type,
        }
      })
  }

  async getFeatures(limit: number = 100): Promise<Feature[]> {
    const res = await this.pool.query(sql.unsafe`
      SELECT jsonb_build_object(
               'type', 'Feature',
               'id', ${sql.identifier(["t", this.idField])},
               'geometry', ST_AsGeoJSON(${sql.identifier(["t", this.geomField])})::jsonb,
               'properties', to_jsonb(t.*) - ${sql.literalValue(this.idField)} - ${sql.literalValue(this.geomField)}
             ) AS r
      FROM ${sql.identifier([this.table])} t
      LIMIT ${limit};
    `)

    return res.rows.map(row => destr(row.r)) as Feature[]
  }

  async getFeatureByID(id: number | string): Promise<Feature | undefined> {
    const res = await this.pool.query(sql.unsafe`
      SELECT jsonb_build_object(
               'type', 'Feature',
               'id', ${sql.identifier(["t", this.idField])},
               'geometry', ST_AsGeoJSON(${sql.identifier(["t", this.geomField])})::jsonb,
               'properties', to_jsonb(t.*) - ${sql.literalValue(this.idField)} - ${sql.literalValue(this.geomField)}
             ) AS r
      FROM ${sql.identifier([this.table])} t
      WHERE ${sql.identifier(["t", this.idField])} = ${id};
    `)

    if (res.rowCount === 0) {
      return
    }

    return destr(res.rows[0].r)
  }

  async getFeatureWhere(wheres: string): Promise<Feature[]> {
    const res = await this.pool.query(sql.unsafe`
      SELECT st_asgeojson(t.*)
      FROM ${this.table} t
      WHERE ${wheres};
    `)

    return res.rows as Feature[]
  }

  async getTile(x: number, y: number, z: number): Promise<Uint8Array | undefined> {
    const sqlText = sql.unsafe`
      SELECT ST_AsMVT(tile, ${this.table}, 4096, ${this.geomField}, ${this.idField})
      FROM (SELECT ST_AsMVTGeom(
                     ST_Transform(ST_CurveToLine(${sql.identifier([this.geomField])}), 3857),
                     ST_TileEnvelope(${z}, ${x}, ${y}),
                     4096, 64, true
                   ) AS geom,
              ${sql.join(this.columns.map(c => sql.identifier([c.name])), sql.fragment`,`)}
            FROM ${sql.identifier([this.schema, this.table])}
            WHERE ${sql.identifier([this.geomField])} && ST_Transform(ST_TileEnvelope(${z}, ${x}, ${y}), ${this.srid}::int)) AS tile
    `

    const query = this.pool.query(sqlText)
    const res = await query
    if (res.rowCount == null || res.rowCount === 0) {
      return
    }

    return res.rows[0].st_asmvt
  }

  async updateTile(_x: number, _y: number, _z: number, _tile: Uint8Array): Promise<void> {
  }

  async close(): Promise<void> {
    await Promise.all([
      this.pool.end(),
    ])
  }

  private async getExtent(): Promise<[number, number, number, number]> {
    const { rows } = await this.pool.query(sql.unsafe`
      SELECT st_xmin(extent.table_extent) xmin,
             st_ymin(extent.table_extent) ymin,
             st_xmax(extent.table_extent) xmax,
             st_ymax(extent.table_extent) ymax
      FROM (SELECT st_transform(ST_SetSRID(ST_Extent(${sql.identifier([this.geomField])}), ${this.srid}), 4326) as table_extent
            FROM ${sql.identifier([this.table])}) extent
    `)

    return [rows[0].xmin, rows[0].ymin, rows[0].xmax, rows[0].ymax]
  }

  async getMetadata(): Promise<XYZProviderMetadata> {
    const bounds = await this.getExtent()

    return {
      maxzoom: 20,
      minzoom: 0,
      name: this.table,
      format: "pbf",
      bounds,
    }
  }

  async setMetadata(_metadata: XYZProviderMetadata): Promise<void> {
  }
}
