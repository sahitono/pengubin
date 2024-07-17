import type { Database as IDatabase, Statement, Transaction } from "better-sqlite3"
import Database from "better-sqlite3"
import { get, objectify } from "radash"
import destr from "destr"
import { Pattern, match } from "ts-pattern"
import type { Provider, ProviderMetadata } from "../interface"
import { removeNewLine } from "../../utils/removeNewLine"

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

const UpdateTileNormalized = `
  INSERT OR
  REPLACE
  INTO images (tile_id, tile_data)
  VALUES (?, ?)
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

type UpdateOrInsertTx = Transaction<(tile: [number, number, number, Uint8Array]) => Database.RunResult>

export class MBTiles implements Provider {
  type = "mbtiles"
  readonly db: IDatabase
  private readTileStmt: Statement<[number, number, number], TileResult>
  // private updateTileStmt: Statement<[number, number, number, tile: Uint8Array], void>
  private getTileIDStmt?: Statement<[number, number, number], {
    tile_id: number
  }> = undefined

  private sourceTable: string
  private readonly schemaType: MBTileSchemaType
  private updateTx?: UpdateOrInsertTx

  constructor(location: string, turnOnWal: boolean = false, writeAccess: boolean = false) {
    if (turnOnWal) {
      this.db = new Database(location, {
        readonly: false,
        fileMustExist: true,
        // verbose(s) {
        //   console.log(s)
        // },
      })
      this.db.pragma("journal_mode = WAL")
      this.db.close()
    }

    this.db = new Database(location, {
      readonly: !writeAccess,
      fileMustExist: true,
      // verbose(s) {
      //   console.log(s)
      // },
    })
    this.schemaType = this.readSchemaType()
    this.sourceTable = this.schemaType === MBTileSchemaType.NORMALIZED ? "images" : "tiles"
    this.readTileStmt = this.db.prepare(GetTileFlat.trim().replaceAll("\n", " "))

    if (!writeAccess) {
      return
    }
    if (this.schemaType === MBTileSchemaType.FLAT) {
      this.updateTx = createUpdateTransactionFlat(this.db)
    }
    else {
      this.updateTx = createUpdateTransactionNormalized(this.db)
    }
  }

  async init() {
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

  async updateTile(x: number, y: number, z: number, tile: Uint8Array): Promise<void> {
    if (this.updateTx == null) {
      throw new Error("operation not supported, db readonly")
    }
    const flippedY = (2 ** z) - 1 - y
    const res = this.updateTx.immediate([x, flippedY, z, tile])
    if (res.changes === 0) {
      throw new Error(`Failed to update ${x}, ${y}, ${z}`)
    }
  }

  async getMetadata(): Promise<ProviderMetadata> {
    const rows = this.db.prepare<[], {
      name: MBTilesMetadataKey
      value: string
    }>("SELECT name, value FROM metadata WHERE name != 'agg_tiles_hash'").all()

    const parsed = objectify(rows, ({ name }) => name, ({ value }) => destr(value))

    // @ts-expect-error hack now
    return {
      ...parsed,
      metadata: get(parsed, "metadata", ""),
    }
  }

  async setMetadata(metadata: ProviderMetadata): Promise<void> {
    const insertMetadata = this.db.prepare<[string, string]>(`
      INSERT OR
      REPLACE
      INTO metadata (name, value)
      VALUES (?, ?)
    `)

    this.db.transaction(() => {
      for (const [name, value] of Object.entries(metadata)) {
        insertMetadata.run(name, match(value)
          .with(Pattern.string, p => p)
          .otherwise(p => JSON.stringify(p)))
      }
    })
  }

  async close() {
    this.db.close()
  }
}

function createUpdateTransactionNormalized(db: Database.Database): UpdateOrInsertTx {
  const insertStatemnt = db.prepare(removeNewLine(UpdateTileNormalized))

  const readStatement = db.prepare<[number, number, number], {
    tile_id: number
  }>(removeNewLine(`
    SELECT tile_id
    FROM map
    WHERE zoom_level = CAST(? AS INTEGER)
      AND tile_column = CAST(? AS INTEGER)
      AND tile_row = CAST(? AS INTEGER)
  `))

  const readMaxID = db.prepare<[], {
    id: number
  }>(`SELECT MAX(tile_id) as id
      FROM images`)

  return db.transaction((tile: [number, number, number, tile: Uint8Array]): Database.RunResult => {
    const mapTile = readStatement.get(tile[0], tile[1], tile[2])
    let tileId = mapTile?.tile_id
    if (tileId == null) {
      const maxId = readMaxID.all()[0]
      tileId = maxId.id + 1

      insertStatemnt.run(tileId, tile[3])
    }
    return insertStatemnt.run(tileId, tile[3])
  })
}

function createUpdateTransactionFlat(db: Database.Database): UpdateOrInsertTx {
  const statement = db.prepare(
    `
      INSERT OR
      REPLACE
      INTO tiles (tile_column, tile_row, zoom_level, tile_data)
      VALUES (CAST(? AS INTEGER),
              CAST(? AS INTEGER),
              CAST(? AS INTEGER),
              ?)
    `,
  )

  return db.transaction(([x, y, z, data]) => {
    statement.run(x, y, z, data)
  })
}
