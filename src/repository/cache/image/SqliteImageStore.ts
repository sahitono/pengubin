import type BtrSqlite from "better-sqlite3"
import Database from "better-sqlite3"
import type { ImageStore } from "./ImageCache"

export interface CacheImageObject {
  hashKey: string
  groupName: string
  x: number
  y: number
  z: number
  otherKey: string
  cacheData: Uint8Array
  expiredAt: number
}

export interface SqliteImageStoreOptions {
  sqliteFile?: string
  cacheTableName?: string
  enableWALMode?: boolean
}

function isExpired(date: number): boolean {
  return date < Date.now()
}

export class SqliteImageStore implements ImageStore {
  readonly db: BtrSqlite.Database
  readonly selectHashKeyStatement: BtrSqlite.Statement<string, CacheImageObject>
  readonly selectXYZStatement: BtrSqlite.Statement<[string, number, number, number, string], CacheImageObject>
  readonly updateStatement: BtrSqlite.Statement<[string, string, number, number, number, string, Uint8Array, number, number], void>
  readonly deleteStatement: BtrSqlite.Statement<[string, number, number, number, string], void>
  readonly deleteHashkeyStatement: BtrSqlite.Statement<[string], void>
  readonly deleteGroupStatement: BtrSqlite.Statement<[string], void>
  readonly purgeStatement: BtrSqlite.Statement<[number]>
  readonly emptyStatement: BtrSqlite.Statement<[]>

  constructor(options: SqliteImageStoreOptions) {
    this.db = new Database(options.sqliteFile)
    if (options.enableWALMode) {
      this.db.pragma("journal_mode = WAL")
    }

    const tableName = options.cacheTableName ?? "cache"
    initializeTable(this.db, tableName)

    this.selectHashKeyStatement = this.db.prepare(
      `SELECT *
       FROM ${tableName}
       WHERE hashKey = ?`,
    )

    this.selectXYZStatement = this.db.prepare(
      `SELECT *
       FROM ${tableName}
       WHERE groupName = ?
         AND x = ?
         AND y = ?
         AND z = ?
         AND otherKey = ?`,
    )

    this.updateStatement = this.db.prepare(`
      INSERT OR
      REPLACE
      INTO ${tableName}(hashKey, groupName, x, y, z, otherKey, cacheData, createdAt, expiredAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.deleteStatement = this.db.prepare(`
      DELETE
      FROM ${tableName}
      WHERE groupName = ?
        AND x = ?
        AND y = ?
        AND z = ?
        AND otherKey = ?
    `)

    this.deleteHashkeyStatement = this.db.prepare(`
      DELETE
      FROM ${tableName}
      WHERE hashKey = ?
    `)

    this.deleteGroupStatement = this.db.prepare(`
      DELETE
      FROM ${tableName}
      WHERE groupName = ?
    `)

    this.purgeStatement = this.db.prepare(`DELETE
                                           FROM ${tableName}
                                           WHERE expiredAt != -1
                                             AND expiredAt < ?`)

    this.emptyStatement = this.db.prepare(`DELETE
                                         FROM ${tableName}`)
  }

  async get(group: string, x: number, y: number, z: number, otherValue: string): Promise<Uint8Array | undefined> {
    const row = this.selectXYZStatement.get(group, x, y, z, otherValue)
    if (row == null) {
      return
    }

    if (isExpired(row.expiredAt)) {
      this.deleteHashkeyStatement.run(row.hashKey)
      return
    }

    return row.cacheData
  }

  async set(group: string, x: number, y: number, z: number, hash: string, value: Uint8Array, ttl: number, otherValue: string): Promise<void> {
    this.updateStatement.run(hash, group, x, y, z, otherValue, value, Date.now(), Date.now() + ttl)
  }

  async delete(group: string, x: number, y: number, z: number, otherValue: string): Promise<void> {
    this.deleteStatement.run(group, x, y, z, otherValue)
  }

  async deleteAll(group?: string): Promise<void> {
    if (group == null) {
      await this.reset()
      return
    }
    this.deleteGroupStatement.run(group)
  }

  async getByHash(hash: string): Promise<Uint8Array | undefined> {
    const row = this.selectHashKeyStatement.get(hash)
    if (row == null) {
      return
    }

    if (isExpired(row.expiredAt)) {
      this.deleteHashkeyStatement.run(row.hashKey)
      return
    }

    return row.cacheData
  }

  async reset(): Promise<void> {
    this.emptyStatement.run()
  }
}

function initializeTable(db: BtrSqlite.Database, tableName: string) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName}
    (
      hashKey   TEXT PRIMARY KEY,
      groupName TEXT,
      x         INTEGER,
      y         INTEGER,
      z         INTEGER,
      otherKey  TEXT,
      cacheData BLOB,
      createdAt INTEGER,
      expiredAt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_expired_caches ON ${tableName} (expiredAt);
    CREATE INDEX IF NOT EXISTS idx_expired_group_caches ON ${tableName} (groupName, expiredAt);
    CREATE INDEX IF NOT EXISTS idx_composite_key ON ${tableName} (groupName, x, y, z, otherKey);
  `)
}
