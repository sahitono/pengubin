import consola from "consola"
import fastifyRateLimit from "@fastify/rate-limit"
import fastifyHelmet from "@fastify/helmet"
import fastifyCors from "@fastify/cors"
import fastifyGracefulShutdown from "fastify-graceful-shutdown"
import fastifyCaching from "@fastify/caching"
import type { Config } from "./config"
import { createRepo } from "./repository"
import { apiCatalog } from "./routes/catalog"
import { repositoryPlugin } from "./plugins/repository-plugin"
import { createServer } from "./createServer"
import { apiData } from "./routes/data"
import { boomPlugin } from "./plugins/boom-plugin"
import { apiStyle } from "./routes/style"

export async function startServer(config: Config) {
  const repo = await createRepo(config)

  const server = createServer()

  server.register(fastifyCors, {
    origin: config.options.allowedOrigin,
  })
  server.register(fastifyGracefulShutdown).after(() => {
    server.gracefulShutdown(() => {
      server.log.info("Gracefully closing repository resources")
      repo.style.forEach(({ pool }) => {
        pool.destroy()
      })
      repo.data.clear()
      server.log.info("Gracefully closed repository resources")
    })
  })
  server.register(fastifyHelmet)
  server.register(boomPlugin)
  server.register(fastifyRateLimit, {
    max: config.options.rateLimit.limit,
    timeWindow: config.options.rateLimit.windowMs,
    enableDraftSpec: true,
  })
  server.register(fastifyCaching, {
    privacy: fastifyCaching.privacy.NOCACHE,
  })
  server.register(repositoryPlugin, {
    repo,
  })

  const prefix = config.options?.prefix ?? "/"
  server.get(`${prefix}/`, (req, res) => {
    return "Hello"
  })
  server.get(`${prefix}/health`, (req, res) => {
    return res.send("OK")
  })
  server.register(apiCatalog, { prefix })
  server.register(apiData, { prefix })
  server.register(apiStyle, { prefix })

  try {
    await server.listen({
      port: config.options.port,
      host: "0.0.0.0",
    })
    server.log.info(`Server listening at http://0.0.0.0:${config.options.port}${prefix}`)
  }
  catch (err) {
    consola.error("Something went wrong while running server")
    server.log.error(err)
  }
}
