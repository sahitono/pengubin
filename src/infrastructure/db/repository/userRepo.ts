import argon2 from "argon2"
import { eq } from "drizzle-orm"
import type { AppDatabase } from "../index"
import { roleTable, userTable } from "../schema"

async function createRole(db: AppDatabase, roleName: string) {
  return await db.transaction(async (tx) => {
    return await tx.insert(roleTable).values({
      name: roleName,
    }).onConflictDoNothing().execute()
  })
}

async function create(db: AppDatabase, user: {
  name: string
  password: string
  roleId: number
}) {
  return await db.transaction(async (tx) => {
    return await tx.insert(userTable).values({
      username: user.name,
      password: await argon2.hash(user.password),
      roleId: user.roleId,
    }).execute()
  })
}

async function getUser(db: AppDatabase, username: string) {
  const users = await db.select().from(userTable).where(eq(userTable.username, username)).execute()
  if (users.length === 0) {
    return
  }

  return users[0]
}

export const userRepo = {
  create,
  createRole,
  getUser,
}
