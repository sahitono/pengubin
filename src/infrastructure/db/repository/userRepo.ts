import argon2 from "argon2"
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

export const userRepo = {
  create,
  createRole,
}
