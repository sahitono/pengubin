import consola from "consola"
import fastifyRateLimit from "@fastify/rate-limit"
import fastifyHelmet from "@fastify/helmet"
import fastifyCors from "@fastify/cors"
import fastifyGracefulShutdown from "fastify-graceful-shutdown"
import fastifyCaching from "@fastify/caching"
import fastifySwagger from "@fastify/swagger"
import type { Config } from "./config"
import { createRepo } from "./repository"
import { apiCatalog } from "./routes/catalog"
import { repositoryPlugin } from "./plugins/repository-plugin"
import { createServer } from "./createServer"
import { apiData } from "./routes/data"
import { boomPlugin } from "./plugins/boom-plugin"
import { apiStyle } from "./routes/style"
import { apiSprite } from "./routes/sprite"

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
  server.register(fastifySwagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "Pengubin API",
        version: "0.1.0",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Development server",
        },
      ],
      tags: [
        { name: "data", description: "Data source provider in XYZ" },
        { name: "style", description: "Style provider and rendered" },
        { name: "sprite", description: "Sprite generated" },
      ],
      components: {},
      externalDocs: {
        url: "https://swagger.io",
        description: "Find more info here",
      },
    },
  })

  const prefix = config.options?.prefix ?? "/"
  server.get(`${prefix}`, (_req, _res) => {
    return "Hello"
  })
  server.get(`${prefix}/health`, (req, res) => {
    return res.send("OK")
  })
  server.get(`${prefix}/docs.json`, (req, res) => {
    const doc = server.swagger()
    return res.send(doc)
  })
  server.register(apiCatalog, { prefix })
  server.register(apiData, { prefix })
  server.register(apiStyle, { prefix })
  server.register(apiSprite, { prefix })

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
