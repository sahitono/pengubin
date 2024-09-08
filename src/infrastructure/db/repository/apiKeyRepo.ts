import { and, eq, gt } from "drizzle-orm"

import { nanoid } from "nanoid"
import argon2 from "argon2"
import type { AppDatabase } from "../index"
import { apiKeyTable } from "../schema"
import { takeFirst } from "../../../utils/takeFirst"

export async function getValidKey(db: AppDatabase, prefix: string) {
  const rows = await db.select()
    .from(apiKeyTable)
    .where(and(
      eq(apiKeyTable.prefix, prefix),
      gt(apiKeyTable.expiredAt, new Date()),
    ),
    ).execute()

  return takeFirst(rows)
}

export const API_KEY_MAX_VALID = 30 * 24 * 60 * 60
export async function createKey(db: AppDatabase, createdBy: number, expiredAfterSecond: number = API_KEY_MAX_VALID) {
  const createdAt = Date.now() / 1000
  const expiredAt = createdAt + expiredAfterSecond
  const key = nanoid()
  const hashed = await argon2.hash(key)
  const prefix = nanoid(6)

  const resultId = await db.transaction(async (tx) => {
    const res = await tx.insert(apiKeyTable)
      .values({
        prefix,
        hashedKey: hashed,
        createdBy,
        createdAt: new Date(createdAt),
        expiredAt: new Date(expiredAt),
      }).execute()

    return res.lastInsertRowid
  })

  return {
    id: resultId,
    key: `${prefix}.${key}`,
  }
}

export const apiKeyRepo = {
  getValidKey,
  createKey,
}
