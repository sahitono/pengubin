import type { Static } from "@sinclair/typebox"
import { Type } from "@sinclair/typebox"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"

export const ConfigSchema = Type.Object({
  styles: Type.Record(Type.String(), Type.Unsafe<string | StyleSpecification>()),
  providers: Type.Record(Type.String(), Type.Object({
    type: Type.String(),
    url: Type.String(),
  }, { additionalProperties: true })),
  options: Type.Optional(Type.Object({
    allowedOrigin: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())], { default: "*" })),
    port: Type.Optional(Type.Number({ default: 3000 })),
    prefix: Type.Optional(Type.String({ default: "/" })),
    sprites: Type.Optional(Type.String()),
    cache: Type.Optional(Type.Object({
      ttl: Type.Optional(Type.Number({ default: 60 * 1000 })),
      directory: Type.Optional(Type.String({ default: "./" })),
    })),
    rateLimit: Type.Optional(Type.Object({
      windowMs: Type.Optional(Type.Number({ default: 15 * 60 * 1000 })),
      limit: Type.Optional(Type.Number({ default: 10000 })),
    })),
  })),
})

export type Config = Omit<Static<typeof ConfigSchema>, "providers"> & {
  providers: Record<string, { type: string, url: string } & Record<string, unknown>>
}
export type ConfigParsed = Omit<Config, "styles"> & {
  styles: Record<string, StyleSpecification>
}
export type ConfigUnparsed = Omit<Config, "styles"> & {
  styles: Record<string, StyleSpecification | string>
}

type ConfigOption = NonNullable<Config["options"]>
type ConfigCache = NonNullable<ConfigOption["cache"]>
type ConfigRateLimit = NonNullable<ConfigOption["rateLimit"]>
type NonNullableConfigPart = Config["options"] & {
  allowedOrigin: NonNullable<ConfigOption["allowedOrigin"]>
  port: NonNullable<ConfigOption["port"]>
  prefix: NonNullable<ConfigOption["prefix"]>
  sprites: ConfigOption["sprites"]
  cache: ConfigCache & {
    ttl: NonNullable<ConfigCache["ttl"]>
    directory: NonNullable<ConfigCache["directory"]>
  }
  rateLimit: ConfigRateLimit & {
    windowMs: NonNullable<ConfigRateLimit["windowMs"]>
    limit: NonNullable<ConfigRateLimit["limit"]>
  }
}
export type NonNullableConfig = Omit<Config, "options" | "styles"> & {
  styles: Record<string, StyleSpecification>
  options: NonNullableConfigPart
}
