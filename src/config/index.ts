import { readFileSync, writeFileSync } from "node:fs"
import * as process from "node:process"
import { extname, resolve } from "node:path"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import { v8, validateStyleMin } from "@maplibre/maplibre-gl-style-spec"
import destr from "destr"
import defu from "defu"
import consola from "consola"
import Ajv from "ajv"
import { Pattern, match } from "ts-pattern"
import * as toml from "smol-toml"
import type { Config, ConfigUnparsed, NonNullableConfig } from "./schema"
import { ConfigSchema } from "./schema"

/**
 * Parse config and change url style to json
 * @param location
 */
export async function loadConfig(location: string): Promise<NonNullableConfig> {
  const extension = extname(location)
  let config: ConfigUnparsed

  // Read config based on file extension
  if (extension === ".toml") {
    config = toml.parse(readFileSync(location, { encoding: "utf-8" })) as ConfigUnparsed
  }
  else if (extension === ".json") {
    config = destr<ConfigUnparsed>(readFileSync(location, { encoding: "utf-8" }))
  }
  else {
    consola.error(`Unsupported extension: ${extension}`)
    process.exit(1)
  }

  const styles: Config["styles"] = {}
  for (const [key, value] of Object.entries(config.styles)) {
    const styleMgl = await match(value)
      .returnType<Promise<StyleSpecification>>()
      .with(Pattern.string, async (v) => {
        const isOnline = v.includes("http")
        if (isOnline) {
          const res = await (await fetch(value as string)).json()
          return res as StyleSpecification
        }

        return destr<StyleSpecification>(readFileSync(value as string, { encoding: "utf-8" }))
      }).otherwise(async (v) => {
        return v
      })

    const errors = validateStyleMin(styleMgl, v8)
    if (errors.length > 0) {
      consola.error(`Broken style: ${key} =`)
      for (const error of errors) {
        consola.error(`- LINE: ${error.line} @ ${error.identifier}. ${error.message}`)
      }
      process.exit(1)
    }
    styles[key] = styleMgl
  }
  const configParsed: Config = {
    ...config,
    styles,
  }

  const ajv = new Ajv()
  const validate = ajv.compile(ConfigSchema)
  const ok = validate(configParsed)
  if (!ok && validate.errors != null) {
    consola.error("Config file error")
    for (const validateElement of validate.errors) {
      consola.error(validateElement)
    }
    process.exit(0)
  }

  const configWithDefault = defu(configParsed, {
    options: {
      allowedOrigin: ConfigSchema.properties.options.properties.allowedOrigin.default,
      port: ConfigSchema.properties.options.properties.port.default,
      prefix: ConfigSchema.properties.options.properties.prefix.default,
      cache: {
        ttl: ConfigSchema.properties.options.properties.cache.properties.ttl.default,
        directory: ConfigSchema.properties.options.properties.cache.properties.directory.default,
      },
      rateLimit: {
        windowMs: ConfigSchema.properties.options.properties.rateLimit.properties.windowMs.default,
        limit: ConfigSchema.properties.options.properties.rateLimit.properties.limit.default,
      },
      appConfigDatabase: ConfigSchema.properties.options.properties.appConfigDatabase.default,
    } as Config["options"],
  }) as NonNullableConfig

  consola.info(`Reading configuration file at ${location}`)
  consola.info(`Has ${Object.keys(config.styles).length} styles`)
  consola.info(`Has ${Object.keys(config.providers).length} data providers`)
  if (config?.options?.sprites != null) {
    consola.info(`Has sprites at ${config.options.sprites}`)
  }

  consola.debug(`Rendered style cache at ${configWithDefault.options.cache.directory}`)

  return configWithDefault
}

const InitConfig: ConfigUnparsed = {
  options: {
    port: 3000,
    prefix: "/",
    cache: {
      ttl: 60 * 1000,
      directory: "./",
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      limit: 10000,
    },
  },
  styles: {
    styleName1: "location of style.json",
    styleName2: "location of style.json",
  },
  providers: {
    providerName1: {
      type: "mbtiles",
      url: "location of mbtiles",
    },
    providerName2: {
      type: "postgis",
      url: "postgresql://username:password@localhost:port/database",
      table: "tableName",
      idField: "idColumn",
      geomField: "geom column",
    },
  },
}

export type SupportedExtension = "json" | "toml"
/**
 * Initialize Configuration with dummy file in either JSON or TOML
 * @param location
 * @param format - File format, either 'json' or 'toml'
 */
export function initConfig(location: string, format: SupportedExtension = "json") {
  const filepath = resolve(location, `config.${format}`)

  consola.info("Creating config file at")
  consola.info(filepath)

  const content = format === "toml" ? toml.stringify(InitConfig) : JSON.stringify(InitConfig, null, 2)

  writeFileSync(filepath, content)
}
