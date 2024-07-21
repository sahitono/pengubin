import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

export const XYZParamValidator = zValidator("param", z.object({
  name: z.string().min(5),
  x: z.string().pipe(z.coerce.number().min(0).int()),
  y: z.string().pipe(z.coerce.number().min(0).int()),
  z: z.string().pipe(z.coerce.number().min(0).max(23).int()),
}))
