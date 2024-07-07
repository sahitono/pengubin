import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"
import { Pool as TarnPool } from "tarn"
import consola from "consola"
import type { Config } from "../config"
import type { ProviderRepository } from "../providers/repository"
import { MapRenderer } from "./MapRenderer"

export type RendererPool = TarnPool<MapRenderer>

export function createPool(poolSize: number, rendererConfig: {
  style: StyleSpecification
  providers?: Config["providers"]
  providerRepo?: ProviderRepository
}) {
  const pool = new TarnPool<MapRenderer>({
    create: async () => {
      return new MapRenderer(rendererConfig.style, rendererConfig?.providers, rendererConfig?.providerRepo)
    },
    min: poolSize,
    max: poolSize + 2,
    destroy: (res) => {
      res.destroy()
    },
  })
  const interval = setInterval(() => {
    consola.debug(`POOL = ${pool.numUsed()} / ${poolSize}`)
  }, 5000)
  pool.on("destroyRequest", () => {
    clearInterval(interval)
  })

  return {
    pool,
    initialize: async () => {
      let i = 0
      const promises: Promise<any>[] = []
      while (i < poolSize) {
        promises.push(new Promise((resolve) => {
          pool.acquire().promise.then((resource) => {
            pool.release(resource)
            resolve(undefined)
          })
        }))
        i++
      }

      await Promise.all(promises)
    },
  }
}
