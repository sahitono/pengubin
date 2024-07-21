import { Type } from "@sinclair/typebox"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"

export const ConfigSchema = Type.Object({
  styles: Type.Record(Type.String(), Type.Unsafe<string | StyleSpecification>()),
  providers: Type.Record(Type.String(), Type.Object({
    type: Type.String(),
    url: Type.String(),
  })),
  options: Type.Optional(Type.Object({
    allowedOrigin: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
    port: Type.Optional(Type.Number({ default: 3000 })),
    prefix: Type.Optional(Type.String({ default: "/" })),
    sprites: Type.Optional(Type.String()),
    cache: Type.Optional(Type.Object({
      ttl: Type.Optional(Type.Number()),
      directory: Type.Optional(Type.String()),
    })),
    rateLimit: Type.Optional(Type.Object({
      windowMs: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
    })),
  })),
})
