import type { Database as IDatabase, Statement } from "better-sqlite3"
import Database from "better-sqlite3"
import { objectify } from "radash"
import destr from "destr"
import type { Provider } from "../interface"

export enum MBTileSchemaType {
  FLAT = "flat",
  FLAT_WITH_HASH = "flat-with-hash",
  NORMALIZED = "normalized",
}

const GetTileFlat = `
  SELECT t.tile_column x, t.tile_row y, t.zoom_level z, t.tile_data data
  FROM tiles t
  WHERE t.tile_column = CAST(? AS INTEGER)
    AND t.tile_row = CAST(? AS INTEGER)
    AND t.zoom_level = CAST(? AS INTEGER)
`

interface TileResult {
  x: number
  y: number
  z: number
  data: Uint8Array
}

export type MBTilesMetadataKey =
  "format"
  | "name"
  | "description"
  | "bounds"
  | "minzoom"
  | "maxzoom"
  | "json"
  | "agg_tiles_hash"
  | string

export class MBTiles implements Provider {
  type = "mbtiles"
  private db: IDatabase
  private readTileStmt: Statement<[number, number, number], TileResult>
  private sourceTable: string
  private readonly schemaType: MBTileSchemaType

  constructor(location: string, turnOnWal: boolean = false) {
    if (turnOnWal) {
      this.db = new Database(location, {
        readonly: false,
        fileMustExist: true,
      })
      this.db.pragma("journal_mode = WAL")
      this.db.close()
    }

    this.db = new Database(location, {
      readonly: true,
      fileMustExist: true,
      verbose(s) {
        // console.log(s)
      },
    })
    this.schemaType = this.readSchemaType()
    this.sourceTable = this.schemaType === MBTileSchemaType.NORMALIZED ? "images" : "tiles"
    // const sqlQuery = this.type === MBTileSchemaType.FLAT ? GetTileFlat : GetTileNormalized
    this.readTileStmt = this.db.prepare(GetTileFlat.trim().replaceAll("\n", " "))
  }

  private readSchemaType(): MBTileSchemaType {
    const stmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?;")
    const isFlat = (stmt.all("tiles")).length > 0
    if (isFlat) {
      return MBTileSchemaType.FLAT
    }

    const isNormalized = (stmt.all("images")).length > 0
    if (!isNormalized) {
      throw new Error("unsupported mbtiles schema")
    }

    return MBTileSchemaType.NORMALIZED
  }

  async getTile(x: number, y: number, z: number): Promise<Uint8Array | undefined> {
    const flippedY = (2 ** z) - 1 - y
    const tiles = this.readTileStmt.all(x, flippedY, z)
    if (tiles.length === 0) {
      return
    }
    return tiles[0].data
  }

  getMetadata(): Record<MBTilesMetadataKey, string> {
    const rows = this.db.prepare<[], { name: MBTilesMetadataKey, value: string }>("SELECT name, value FROM metadata WHERE name != 'agg_tiles_hash'").all()
    return objectify(rows, ({ name }) => name, ({ value }) => destr(value))
  }

  async close() {
    this.db.close()
  }
}
