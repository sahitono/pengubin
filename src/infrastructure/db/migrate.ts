import * as path from "node:path"
import { migrate as drzMigrate } from "drizzle-orm/better-sqlite3/migrator"

import "dotenv/config"
import { createDb } from "./index"

// export async function migrate(dbUrl: string) {
//   const migrationFolder = new URL("./migrations", import.meta.url).pathname
//
//   const db = createDb(dbUrl)
//
//   const migrator = new Migrator({
//     db,
//     provider: new FileMigrationProvider({
//       fs,
//       path,
//       migrationFolder,
//     }),
//   })
//
//   run(db, migrator, migrationFolder)
//   await db.destroy()
// }

export async function migrate(dbUrl: string) {
  const {
    db,
    conn,
  } = createDb(dbUrl)
  drzMigrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "drizzle") })
  conn.close()
}
