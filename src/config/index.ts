import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import destr from "destr"
import defu from "defu"
import consola from "consola"

export interface Config {
  styles: Record<string, StyleSpecification>
  providers: Record<string, {
    type: string
    url: string
  } & Record<string, unknown>>
  options: {
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

export async function loadConfig(location: string): Promise<Config> {
  const config = destr<ConfigUnparsed>(readFileSync(location, { encoding: "utf-8" }))
  const styles: Config["styles"] = {}
  for (const [key, value] of Object.entries(config.styles)) {
    if (!(value instanceof String)) {
      styles[key] = value as StyleSpecification
      continue
    }

    const isOnline = value.includes("http")
    if (isOnline) {
      styles[key] = await (await fetch(value as string)).json()
      continue
    }

    styles[key] = destr(readFileSync(value as string, { encoding: "utf-8" }))
  }
  const configParsed: Config = {
    ...config,
    styles,
  }

  const configWithDefault = defu(configParsed, {
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
