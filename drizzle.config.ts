import * as process from "node:process"
import { defineConfig } from "drizzle-kit"
import * as dotenv from "dotenv"

dotenv.config()

function getEnv(key: string): string {
  const value = process.env[key]
  if (value == null) {
    throw new Error(`Environment variable ${key} not found`)
  }
  return value
}

export default defineConfig({
  schema: "./src/infrastructure/db/schema.ts",
  out: "./src/infrastructure/db/drizzle",
  dialect: "sqlite", // 'postgresql' | 'mysql' | 'sqlite'
  dbCredentials: {
    url: getEnv("DATABASE_URL"),
  },
})
