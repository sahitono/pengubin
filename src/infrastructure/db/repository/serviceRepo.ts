import * as crypto from "node:crypto"
import { and, eq } from "drizzle-orm"
import type { AppDatabase } from "../index"
import { serviceTable } from "../schema"
import { takeFirst } from "../../../utils/takeFirst"

function generateHash(data: Record<string, unknown>): string {
  const hash = crypto.createHash("sha256")
  hash.update(JSON.stringify(data))
  return hash.digest("hex")
}

export async function createService(db: AppDatabase, name: string, createdBy: number, type: string, config: Record<string, unknown>) {
  const hash = generateHash(config)

  return await db.transaction(async (tx) => {
    const res = await tx.insert(serviceTable).values({
      hash,
      config,
      type,
      name,
      createdAt: new Date(),
      createdBy,
      isPublic: true,
    }).onConflictDoNothing({
      target: serviceTable.hash,
    }).execute()
    return res.lastInsertRowid
  })
}

export async function upsertService(db: AppDatabase, name: string, createdBy: number, type: string, config: Record<string, unknown>) {
  const hash = generateHash(config)
  const service = await getService(db, name, type)
  if (service != null && service.hash === hash) {
    return
  }
  if (service != null) {
    // update
    await db.transaction(async (tx) => {
      const res = await tx.update(serviceTable).set({
        hash,
        config,
        updatedAt: new Date(),
      }).where(and(
        eq(serviceTable.name, name),
        eq(serviceTable.type, type),
        eq(serviceTable.hash, hash),
      ),
      ).execute()
      return res.lastInsertRowid
    })
  }

  return createService(db, name, createdBy, type, config)
}

export async function getService(db: AppDatabase, name: string, type: string) {
  const rows = await db.select()
    .from(serviceTable)
    .where(
      and(
        eq(serviceTable.name, name),
        eq(serviceTable.type, type),
      ),
    )

  return takeFirst(rows)
}
export async function getMany(db: AppDatabase, type?: string) {
  return await db.select()
    .from(serviceTable)
    .where(
      type == null ? undefined : eq(serviceTable.type, type),
    ).execute()
}

export const serviceRepo = {
  getService,
  getMany,
  create: createService,
  upsert: upsertService,
}
