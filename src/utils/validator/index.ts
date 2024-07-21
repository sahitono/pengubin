import type { Static } from "@sinclair/typebox"
import { Type } from "@sinclair/typebox"

export const XYZParam = Type.Object({
  name: Type.String(),
  x: Type.Number({
    minimum: 0,
  }),
  y: Type.Number({
    minimum: 0,
  }),
  z: Type.Number({
    minimum: 0,
    maximum: 23,
  }),
})

export type XYZParamType = Static<typeof XYZParam>
