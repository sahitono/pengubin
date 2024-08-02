import { z } from "zod"

export interface PGTableInfo {
  column_name: string
  data_type: "integer" | "bigint" | "character varying" | "text" | string
}

export const ZPGTableInfo = z.object({
  table_catalog: z.string(),
  table_schema: z.string(),
  table_name: z.string(),
  ordinal_position: z.string(),
  column_default: z.string().optional(),
  is_nullable: z.string().optional(),
  column_name: z.string(),
  data_type: z.string(),
})
