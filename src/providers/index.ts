import type { XYZProvider } from "@pengubin/core"
import type { MBTiles } from "@pengubin/provider-mbtiles"
import type { Postgis } from "@pengubin/provider-postgis"
import type { PostgresTable } from "@pengubin/provider-postgres-table"

export type Providers = XYZProvider | MBTiles | Postgis | PostgresTable

export * from "./interface"
