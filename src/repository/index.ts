import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import { ProviderRepository } from "../providers/repository"
import type { RendererPool } from "../map-renderer/pool"
import { createPool } from "../map-renderer/pool"
import type { Config } from "../config"
import type { TileJSON } from "../types"

export async function createRepo(config: Config) {
  const data = new ProviderRepository()
  await data.init(config.providers)

  const style = new Map<string, {
    parsed: StyleSpecification
    original: StyleSpecification
    pool: RendererPool
    tileJSON: TileJSON
  }>()

  const promises: Promise<unknown>[] = []
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
    // const bounds = Object.values(parsed.sources).map((value) => {
    //   if (value.type === "vector") {
    //     const sourceId = value.ti
    //     return value.bounds
    //   }
    // }).filter(v => v != null)
    // console.log(bounds)
    // const center: [number, number] = [
    //   bounds[0][0] + Math.abs((bounds[0][2] - bounds[0][0]) / 2),
    //   bounds[0][1] + Math.abs((bounds[0][3] - bounds[0][1]) / 2),
    //   // (maxzoom - minzoom) / 2,
    // ]

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

  await Promise.all(promises)

  return {
    config,
    data,
    style,
  }
}

export type Repository = Awaited<ReturnType<typeof createRepo>>
export interface RepositoryRouteOption { repo: Repository }
