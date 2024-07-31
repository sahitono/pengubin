import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import destr from "destr"
import defu from "defu"
import consola from "consola"
import Ajv from "ajv"
import { Pattern, match } from "ts-pattern"
import { ConfigSchema } from "./schema"

export interface Config {
  styles: Record<string, StyleSpecification>
  providers: Record<string, {
    type: string
    url: string
  } & Record<string, unknown>>
  options: {
    allowedOrigin: string | string[]
    sprites: string
    prefix: string
    port: number
    cache: {
      ttl: number
      directory: string
    }
    rateLimit: {
      windowMs: number
      limit: number
    }
  }
}

interface ConfigUnparsed extends Omit<Config, "styles"> {
  styles: Record<string, StyleSpecification | string>
}

/**
 * Parse config and change url style to json
 * @param location
 */
export async function loadConfig(location: string): Promise<Config> {
  const config = destr<ConfigUnparsed>(readFileSync(location, { encoding: "utf-8" }))
  const styles: Config["styles"] = {}
  for (const [key, value] of Object.entries(config.styles)) {
    await match(value)
      .with(Pattern.string, async (v) => {
        const isOnline = v.includes("http")
        if (isOnline) {
          styles[key] = await (await fetch(value as string)).json()
          return
        }

        styles[key] = destr(readFileSync(value as string, { encoding: "utf-8" }))
      }).otherwise(async (v) => {
        styles[key] = v
      })
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
      allowedOrigin: "*",
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
    } as Config["options"],
  }) as Config

  consola.info(`Reading configuration file at ${location}`)
  consola.info(`Has ${Object.keys(config.styles).length} styles`)
  consola.info(`Has ${Object.keys(config.providers).length} data providers`)
  consola.debug(`Rendered style cache at ${config.options.cache.directory}`)

  return configWithDefault
}

const InitConfig = {
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
  styles: {},
  providers: {},
} as ConfigUnparsed

/**
 * Initialize Configuration with dummy file
 * @param location
 */
export function initConfig(location: string) {
  const filepath = resolve(location, "config.json")

  consola.info("Creating config file at")
  consola.info(filepath)

  writeFileSync(filepath, JSON.stringify(InitConfig, null, 2), { encoding: "utf-8" })
}
