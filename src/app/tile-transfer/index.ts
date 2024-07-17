import { MBTiles } from "../../providers/mbtiles"
import { PostgresTable, type PostgresTableParam } from "../../providers/postgres-table"

interface TransferParam {
  postgres: PostgresTableParam
  mbtile: string
}

async function main(param: TransferParam) {
  const dbTarget = await PostgresTable.create(param.postgres)
  await dbTarget.init()

  const dbSource = new MBTiles(param.mbtile)

  const getAll = dbSource.db.prepare<[], {
    tile_column: number
    tile_row: number
    zoom_level: number
    tile_data: Uint8Array
  }>(`SELECT *
      FROM tiles`)

  for (const row of getAll.iterate()) {
    await dbTarget.updateTile(row.tile_column, row.tile_row, row.zoom_level, row.tile_data)
  }

  await dbSource.close()
  await dbTarget.close()
}

main({
  mbtile: "D:/Documents/00-self-project/ubin-server/test-cache.mbtiles",
  postgres: {
    url: "postgres://postgres:9918@localhost:5437/badung",
    table: "bidang_test",
  },
})
  .then(() => {
    console.log("Woohoo")
  }).catch((e) => {
    console.error(e)
  })
