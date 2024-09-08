// import { Kysely, SqliteDialect } from "kysely"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"
// import type { ApiKeyTable, ServiceTable } from "./schema"
//
// export interface AppDatabase {
//   apiKey: ApiKeyTable
//   service: ServiceTable
// }
//
// export function createDb(url: string): Kysely<AppDatabase> {
//   return new Kysely<AppDatabase>({
//     dialect: new SqliteDialect({
//       database: new Database(url, {
//         fileMustExist: false,
//       }),
//     }),
//   })
// }

export function createDb(url: string) {
  const sqlite = new Database(url, {
    fileMustExist: false,
    readonly: false,
  })
  sqlite.pragma("journal_mode = WAL")

  return {
    db: drizzle(sqlite, {
      schema,
    }),
    conn: sqlite,
  }
}

export type AppDatabase = ReturnType<typeof createDb>["db"]
