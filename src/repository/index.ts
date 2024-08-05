import * as path from "node:path"
import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import { ProviderRepository } from "../providers/repository"
import type { RendererPool } from "../map-renderer/pool"
import { createPool } from "../map-renderer/pool"
import type { Config } from "../config"
import type { TileJSON } from "../types"
import type { RenderedSprite } from "../sprites"
import { renderSprite } from "../sprites"

export async function createRepo(config: Config) {
  const data = new ProviderRepository()
  await data.init(config.providers)

  const style = new Map<string, {
    parsed: StyleSpecification
    original: StyleSpecification
    pool: RendererPool
    tileJSON: TileJSON
  }>()
  const sprite = new Map<string, RenderedSprite>()

  const promises: Promise<any>[] = []
  for (const styleName of Object.keys(config.styles)) {
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

  return {
    config,
    data,
    style,
    sprite,
  }
}

export type Repository = Awaited<ReturnType<typeof createRepo>>
export interface RepositoryRouteOption { repo: Repository }
