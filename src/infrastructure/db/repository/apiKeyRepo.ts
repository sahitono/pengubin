import { and, eq, gt } from "drizzle-orm"

import { nanoid } from "nanoid"
import argon2 from "argon2"
import type { AppDatabase } from "../index"
import { apiKeyServiceTable, apiKeyTable } from "../schema"
import { takeFirst } from "../../../utils/takeFirst"

export async function getById(db: AppDatabase, apiKeyId: number, creator?: number) {
  const users = await db.select()
    .from(apiKeyTable)
    .where(
      and(
        eq(apiKeyTable.id, apiKeyId),
        creator ? eq(apiKeyTable.createdBy, creator) : undefined,
      ),
    )
    .execute()

  return takeFirst(users)
}

export async function getAll(db: AppDatabase, creator?: number) {
  return await db.select()
    .from(apiKeyTable)
    .where(creator ? eq(apiKeyTable.createdBy, creator) : undefined)
    .execute()
}

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

export async function createKey(db: AppDatabase, createdBy: number, services: number[] = [], expiredAfterSecond: number = API_KEY_MAX_VALID) {
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

    if (services.length > 0) {
      await tx.insert(apiKeyServiceTable).values(services.map(serviceId => ({
        apiKeyId: res.lastInsertRowid as number,
        serviceId,
      })))
        .execute()
    }

    return res.lastInsertRowid
  })

  return {
    id: resultId,
    key: `${prefix}.${key}`,
  }
}

export async function updateService(db: AppDatabase, apiKeyId: number, services: number[]) {
  await db.transaction(async (tx) => {
    await tx.delete(apiKeyServiceTable).where(eq(apiKeyServiceTable.apiKeyId, apiKeyId)).execute()

    await tx.insert(apiKeyServiceTable).values(services.map(serviceId => ({
      apiKeyId,
      serviceId,
    })))
      .execute()
  })
}

export async function refreshApiKey(db: AppDatabase, apiKeyId: number, expiredAfterSecond: number = API_KEY_MAX_VALID) {
  const createdAt = Date.now() / 1000
  const expiredAt = createdAt + expiredAfterSecond
  const key = nanoid()
  const hashed = await argon2.hash(key)
  const prefix = nanoid(6)

  await db.transaction(async (tx) => {
    await tx.update(apiKeyTable).set({
      prefix,
      hashedKey: hashed,
      createdAt: new Date(createdAt),
      expiredAt: new Date(expiredAt),
    })
      .where(eq(apiKeyTable.id, apiKeyId))
      .execute()
  })
}

export const apiKeyRepo = {
  getAll,
  getById,
  getValidKey,
  createKey,
  refreshApiKey,
  updateService,
}
