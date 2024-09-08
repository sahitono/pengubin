// import type { ColumnType, Generated, Insertable, Selectable, Updateable } from "kysely"
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const roleTable = sqliteTable("role", {
  id: integer("id").primaryKey({
    autoIncrement: true,
  }),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql<number>`(unixepoch())`),
})

export const userTable = sqliteTable("user_account", {
  id: integer("id").primaryKey({
    autoIncrement: true,
  }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  roleId: integer("role_id").notNull().references(() => roleTable.id, {
    onDelete: "cascade",
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql<number>`(unixepoch())`),
})

export const apiKeyTable = sqliteTable("api_key", {
  id: integer("id").primaryKey({
    autoIncrement: true,
  }),
  prefix: text("prefix").unique().notNull(),
  hashedKey: text("hashed_key").unique().notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql<number>`(unixepoch())`),
  expiredAt: integer("expired_at", { mode: "timestamp" }).notNull(),
}, (table) => {
  return {
    prefixExpiredIdx: index("prefix_expired_idx").on(table.prefix, table.expiredAt),
    expiredKeyIdx: index("expired_key_idx")
      .on(table.expiredAt)
      .where(sql`expired_at < unixepoch()`),
  }
})

export const serviceTable = sqliteTable("service", {
  id: integer("id").primaryKey({
    autoIncrement: true,
  }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  hash: text("hash").notNull().unique(),
  config: text("config", {
    mode: "json",
  }).notNull(),
  isPublic: integer("is_public", { mode: "boolean" }),
  createdBy: integer("created_by").notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql<number>`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (table) => {
  return {
    nameTypeIdx: index("name_type_idx").on(table.name, table.type),
  }
})

export const apiKeyServiceTable = sqliteTable("api_key_service", {
  apiKeyId: integer("api_key_id").notNull().references(() => apiKeyTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => serviceTable.id, { onDelete: "cascade" }),
}, (table) => {
  return {
    apiKeyIdx: index("api_key_service_api_key_idx").on(table.apiKeyId),
    serviceIdx: index("api_key_service_service_idx").on(table.serviceId),
  }
})
