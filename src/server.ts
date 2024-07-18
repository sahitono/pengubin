import type { HttpBindings } from "@hono/node-server"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import consola, { createConsola } from "consola"
import { rateLimiter } from "hono-rate-limiter"
import { get } from "radash"
import { hash } from "ohash"
import type { Config } from "./config"
import { createRepo } from "./repository"
import { apiCatalog } from "./routes/catalog"
import { apiData } from "./routes/data"
import { apiStyle } from "./routes/style"

const port = 3000

export async function createServer(config: Config) {
  const repo = await createRepo(config)

  const app = new Hono<{ Bindings: HttpBindings }>()
  app.use(logger(createConsola().log))
  app.use(cors({
    origin: "*",
  }))
  app.use(rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: "draft-6", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    keyGenerator: (c) => {
      return hash({ remoteAddress: get(c, "env.incoming.socket.remoteAddress"), url: c.req.raw.url })
    },
  //   keyGenerator: c => "<unique_key>", // Method to generate custom identifiers for clients.
  // // store: ... , // Redis, MemoryStore, etc. See below.
  }))

  const prefix = config.options?.prefix ?? "/"
  app.get(prefix, (c) => {
    return c.text("Hi")
  })
  app.route(prefix, app.get("/health", (c) => {
    return c.text("OK")
  }))

  app.route(prefix, await apiCatalog(repo))
  app.route(prefix, await apiData(repo))
  app.route(prefix, await apiStyle(repo))

  // eslint-disable-next-line node/prefer-global/process
  process.on("beforeExit", () => {
    consola.info("Gracefully exiting...")
    repo.style.forEach(({ pool }) => {
      pool.destroy()
    })
    repo.data.clear()
  })

  return serve({
    fetch: app.fetch,
    port: config.options.port,
  }, (info) => {
    consola.info(`Server starting at http://${info.address}:${info.port}${prefix}`)
  })
}
