import { readFileSync } from "node:fs"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import destr from "destr"
import defu from "defu"

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
  }
}

interface ConfigUnparsed {
  styles: Record<string, StyleSpecification | string>
  providers: Record<string, {
    type: string
    url: string
  } & Record<string, unknown>>
  options: {
    port: number
    sprites: string
    prefix: string
    cache: {
      ttl: number
      directory: string
    }
  }
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

  return defu(configParsed, {
    options: {
      port: 3000,
      prefix: "/",
      cache: {
        ttl: 60 * 1000,
        directory: "./",
      },
    },
  }) as Config
}
