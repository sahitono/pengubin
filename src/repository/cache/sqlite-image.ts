/**
 * Taken from https://github.com/huijiewei/cache-manager-sqlite/blob/main/src/index.ts
 */

import type { Buffer } from "node:buffer"
import Database from "better-sqlite3"
import type { Cache, Config, Milliseconds, Store } from "cache-manager"
import consola from "consola"

type SqliteStoreOptions = {
  sqliteFile?: string
  cacheTableName: string
  enableWALMode?: boolean
} & Config

interface CacheObject {
  cacheKey: string
  cacheData: Buffer
  createdAt: number
  expiredAt: number
}

function now() {
  return new Date().getTime()
}

export type SqliteImageStore = Store & {
  name: string
  get client(): ReturnType<typeof Database>
  get: (key: string) => Promise<Buffer>
  set: (key: string, data: Buffer, ttl?: Milliseconds) => Promise<void>
  mset: (arguments_: Array<[string, Buffer]>, ttl?: Milliseconds) => Promise<void>
  mget: (...arguments_: string[]) => Promise<Buffer[]>
  mdel: (...arguments_: string[]) => Promise<void>
}

export type SqliteImageCache = Cache<SqliteImageStore>

export function sqliteImageStore(options: SqliteStoreOptions): SqliteImageStore {
  const isCacheable = options?.isCacheable ?? (val => val !== undefined)
  const enableWALMode = options?.enableWALMode ?? true

  const sqlite = new Database(options.sqliteFile)
  consola.debug(`Reading database at ${options.sqliteFile}`)

  if (enableWALMode) {
    sqlite.pragma("journal_mode = WAL")
  }

  const tableName = options.cacheTableName

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName}
    (
      cacheKey  TEXT PRIMARY KEY,
      cacheData BLOB,
      createdAt INTEGER,
      expiredAt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_expired_caches ON ${tableName} (expiredAt);`)

  const selectSingleStatement = sqlite.prepare<string, CacheObject>(`SELECT *
                                                                     FROM ${tableName}
                                                                     WHERE cacheKey = ?`)
  const selectStatement = sqlite.prepare<string, CacheObject>(
    `SELECT *
     FROM ${tableName}
     WHERE cacheKey IN (SELECT value FROM json_each(?))`,
  )
  const updateStatement = sqlite.prepare<[string, Buffer, number, number]>(
    `INSERT OR
     REPLACE INTO ${tableName}(cacheKey, cacheData, createdAt, expiredAt)
     VALUES (?, ?, ?, ?)`,
  )
  const deleteSingleStatement = sqlite.prepare<string>(`DELETE
                                                        FROM ${tableName}
                                                        WHERE cacheKey = ?`)
  const deleteStatement = sqlite.prepare<string>(`DELETE
                                                  FROM ${tableName}
                                                  WHERE cacheKey IN (SELECT value FROM json_each(?))`)
  const finderStatement = sqlite.prepare<[string, number]>(
    `SELECT cacheKey
     FROM ${tableName}
     WHERE cacheKey LIKE ?
       AND (expiredAt = -1 OR expiredAt > ?)`,
  )
  const purgeStatement = sqlite.prepare<number>(`DELETE
                                                 FROM ${tableName}
                                                 WHERE expiredAt != -1
                                                   AND expiredAt < ?`)
  const emptyStatement = sqlite.prepare(`DELETE
                                         FROM ${tableName}`)

  const fetchCaches = (...args: string[]): CacheObject[] => {
    const ts = now()
    let purgeExpired = false

    const result
      = args.length >= 3
        ? selectStatement
          .all(JSON.stringify(args))
          .map((data) => {
            if (data.expiredAt !== -1 && data.expiredAt < ts) {
              purgeExpired = true
              return undefined
            }
            return data
          })
          .filter(data => data !== undefined)
        : args
          .map((key) => {
            const data = selectSingleStatement.get(key)
            if (data !== undefined && data.expiredAt !== -1 && data.expiredAt < ts) {
              purgeExpired = true
              return undefined
            }

            return data
          })
          .filter(data => data !== undefined)

    if (purgeExpired) {
      // eslint-disable-next-line node/prefer-global/process
      process.nextTick(() => purgeStatement.run(ts))
    }

    return result as CacheObject[]
  }

  const deleteCaches = (...args: string[]) => {
    if (args.length >= 3) {
      deleteStatement.run(JSON.stringify(args))
    }
    else {
      for (const k of args) {
        deleteSingleStatement.run(k)
      }
    }
  }

  const updateCatches = (args: [string, Buffer][], ttl?: Milliseconds) => {
    const t = ttl == null ? options?.ttl : ttl
    const createdAt = now()
    const expiredAt = t != null && t !== 0 ? createdAt + t : -1

    for (const cache of args) {
      if (!isCacheable(cache[1])) {
        throw new Error(`no cacheable value ${JSON.stringify(cache[1])}`)
      }

      updateStatement.run(cache[0], cache[1], createdAt, expiredAt)
    }
  }

  return {
    name: "sqlite",
    del(key: string): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          deleteCaches(key)
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    },
    // @ts-expect-error bypass use buffer
    get(key: string): Promise<Buffer | undefined> {
      return new Promise((resolve, reject) => {
        try {
          const result = fetchCaches(key)

          if (result.length === 0) {
            resolve(undefined)
          }
          else {
            resolve(result[0].cacheData)
          }
        }
        catch (e) {
          reject(e)
        }
      })
    },
    keys(pattern?: string): Promise<string[]> {
      return new Promise((resolve, reject) => {
        try {
          const result = (finderStatement.all(pattern?.replaceAll("*", "%") ?? "%", now()) as CacheObject[]).map(
            cache => cache.cacheKey,
          )
          resolve(result)
        }
        catch (e) {
          reject(e)
        }
      })
    },
    mdel(...args: string[]): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          deleteCaches(...args)
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    },
    mget(...args: string[]): Promise<Buffer[]> {
      return new Promise((resolve, reject) => {
        try {
          const result = fetchCaches(...args).map(data => data.cacheData)

          const fillLen = args.length - result.length

          resolve(fillLen ? result.concat(Array(fillLen).fill(undefined)) : result)
        }
        catch (e) {
          reject(e)
        }
      })
    },
    mset(args: [string, Buffer][], ttl?: Milliseconds): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          updateCatches(args, ttl)
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    },
    reset(): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          emptyStatement.run()
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    },
    // @ts-expect-error bypass buffer
    set(key: string, data: Buffer, ttl?: Milliseconds): Promise<void> {
      return new Promise((resolve, reject) => {
        try {
          updateCatches([[key, data]], ttl)
          resolve()
        }
        catch (e) {
          reject(e)
        }
      })
    },
    ttl(key: string): Promise<number> {
      return new Promise((resolve, reject) => {
        try {
          const result = fetchCaches(key)

          if (result.length === 0) {
            resolve(-2)
          }
          else {
            resolve(result[0].expiredAt === -1 ? -1 : result[0].expiredAt - now())
          }
        }
        catch (e) {
          reject(e)
        }
      })
    },
    get client() {
      return sqlite
    },
  }
}
