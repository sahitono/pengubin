import * as path from "node:path"
import readline from "node:readline"
import { exit, stdin, stdout } from "node:process"
import { migrate as drzMigrate } from "drizzle-orm/better-sqlite3/migrator"

import "dotenv/config"
import consola from "consola"
import { DefaultAdminRole } from "../../constants/DefaultAdminRole"
import { userRepo } from "./repository/userRepo"
import { createDb } from "./index"

export async function migrate(dbUrl: string) {
  const {
    db,
    conn,
  } = createDb(dbUrl)
  drzMigrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "drizzle") })
  conn.close()
}

export async function initializeUser(dbUrl: string, username?: string, password?: string) {
  const {
    db,
    conn,
  } = createDb(dbUrl)
  const hasNoUser = (await db.query.userTable.findMany({
    columns: {
      id: true,
    },
  }).execute()).length === 0

  if (!hasNoUser) {
    conn.close()
    return
  }

  consola.info("Please provide user and password")
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  })
  const un = username ?? await readStdIn(rl, "username:")
  const pwd = password ?? await readStdIn(rl, "password:")
  if (un.length < 6 || pwd.length < 6) {
    consola.error("password and username should be at least 6")
    exit(1)
  }
  await userRepo.createRole(db, DefaultAdminRole)
  await userRepo.create(db, {
    name: un,
    password: pwd,
    roleId: 1,
  })

  consola.success(`User ${un} created`)
  conn.close()
}

function readStdIn(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    rl.question(`${question}\n`, (answer) => {
      resolve(answer)
      setTimeout(() => {
        reject(new Error("timeout"))
      }, 30000)
    })
  })
}
