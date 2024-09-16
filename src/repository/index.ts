import * as path from "node:path"
import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { createSecretKey } from "node:crypto"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import { objectify } from "radash"
import consola from "consola"
import { ProviderRepository } from "../providers/repository"
import type { RendererPool } from "../map-renderer/pool"
import { createPool } from "../map-renderer/pool"
import type { NonNullableConfig } from "../config/schema"
import type { TileJSON } from "../types"
import type { RenderedSprites } from "../sprites"
import { renderSprite } from "../sprites"
import { createDb } from "../infrastructure/db"
import { serviceRepo } from "../infrastructure/db/repository"
import { ServiceType } from "../constants/ServiceType"

export async function createRepo(config: NonNullableConfig) {
  consola.info("Merging database and file config...")
  const services = await import2database(config)
  if (Object.keys(services.styles).length !== Object.keys(config.styles).length) {
    consola.info(`DB and file have ${Object.keys(services.styles).length} styles`)
  }

  if (Object.keys(services.providers).length !== Object.keys(config.providers).length) {
    consola.info(`DB and file have ${Object.keys(services.providers).length} data providers`)
  }

  consola.info("Loading style and data...")
  const data = new ProviderRepository()
  await data.init(services.providers)

  const style = new Map<string, {
    parsed: StyleSpecification
    original: StyleSpecification
    pool: RendererPool
    tileJSON: TileJSON
  }>()
  const sprite = new Map<string, RenderedSprites>()
  const promises: Promise<any>[] = []

  for (const styleName of Object.keys(services.styles)) {
    const value = config.styles[styleName]
    const parsed = { ...value } as StyleSpecification

    const {
      pool,
      initialize,
    } = createPool(14, {
      style: value,
      providerRepo: data,
    })

    promises.push(initialize())

    const minzoom = Math.min(...parsed.layers.map(l => l?.minzoom ?? 0))
    const maxzoom = Math.max(...parsed.layers.map(l => l?.maxzoom ?? 20))

    style.set(styleName, {
      parsed,
      original: value,
      pool,
      tileJSON: {
        id: styleName,
        tiles: [],
        tilejson: "2.0.0",
        format: "png",
        type: "baselayer",
        minzoom,
        maxzoom,
      },
    })
  }

  const createSprite = (location: string, name?: string) => {
    return new Promise<void>((resolve, reject) => {
      const parsed = path.parse(location)
      renderSprite({
        location,
      }).then((rendered) => {
        sprite.set(name ?? parsed.name, rendered)
        resolve()
      }).catch((e) => {
        reject(e)
      })
    })
  }

  if (config.options.sprites) {
    promises.push(createSprite(config.options.sprites, "default"))
    readdirSync(config.options.sprites, { withFileTypes: true })
      .filter(f => f.isDirectory())
      .forEach((f) => {
        promises.push(createSprite(resolve(f.parentPath, f.name)))
      })
  }

  await Promise.all(promises)
  consola.success("Loaded style and data...")

  return {
    config,
    data,
    style,
    sprite,
    secretKey: createSecretKey(config.options.secret, "utf8"),
  }
}

async function import2database(config: NonNullableConfig): Promise<{
  styles: NonNullableConfig["styles"]
  providers: NonNullableConfig["providers"]
}> {
  const { db, conn } = createDb(config.options.appConfigDatabase)
  const promises: Promise<any>[] = []
  for (const providerKey of Object.keys(config.providers)) {
    promises.push(serviceRepo.upsert(db, providerKey, 1, ServiceType.DATA, config.providers[providerKey]))
  }

  for (const styleKey of Object.keys(config.styles)) {
    promises.push(serviceRepo.upsert(db, styleKey, 1, ServiceType.STYLE, config.styles[styleKey]))
  }

  await Promise.all(promises)
  const [data, style] = await Promise.all([
    serviceRepo.getMany(db, ServiceType.DATA),
    serviceRepo.getMany(db, ServiceType.STYLE),
  ])
  conn.close()

  return {
    providers: objectify(data, d => d.name, d => d.config as NonNullableConfig["providers"]["string"]),
    styles: objectify(style, d => d.name, d => d.config as NonNullableConfig["styles"]["string"]),
  }
}

export type Repository = Awaited<ReturnType<typeof createRepo>>

export interface RepositoryRouteOption {
  repo: Repository
}
