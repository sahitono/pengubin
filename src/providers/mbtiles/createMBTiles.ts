import Database from "better-sqlite3"
import { removeNewLine } from "../../utils/removeNewLine"
import { MBTiles } from "./index"

const CreateFlatSQL = `
  CREATE TABLE IF NOT EXISTS tiles
  (
    zoom_level  INTEGER,
    tile_column INTEGER,
    tile_row    INTEGER,
    tile_data   BLOB
  );

  CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);
`

const CreateMetadataSQL = `
  CREATE TABLE IF NOT EXISTS metadata
  (
    name  TEXT,
    value TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS metadata_index ON metadata (name);
`

export async function createMBTiles(location: string): Promise<MBTiles> {
  const db = new Database(location, {
    readonly: false,
    fileMustExist: false,
  })

  db.pragma("journal_mode = WAL")

  db.exec(removeNewLine(CreateFlatSQL))
  db.exec(removeNewLine(CreateMetadataSQL))

  db.close()

  return new MBTiles(location, false, true)
}
