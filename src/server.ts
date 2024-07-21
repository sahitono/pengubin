import type { HttpBindings } from "@hono/node-server"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { logger } from "hono/logger"
import { cors } from "hono/cors"
import consola, { createConsola } from "consola"
import { serveStatic } from "@hono/node-server/serve-static"
import { rateLimiter } from "hono-rate-limiter"
import { HTTPException } from "hono/http-exception"
import type { Config } from "./config"
import { createRepo } from "./repository"
import { apiCatalog } from "./routes/catalog"
import { apiData } from "./routes/data"
import { apiStyle } from "./routes/style"
import { apiPlayground } from "./routes/playground"

export async function createServer(config: Config) {
  const repo = await createRepo(config)

  const app = new Hono<{ Bindings: HttpBindings }>()
  app.use(logger(createConsola().log))
  app.use(cors({
    origin: "*",
  }))
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.getResponse()
    }

    // if (err.message === "Response body object should not be disturbed or locked ") {
    //   // c.req.raw.
    // }

    consola.error(err)
    return c.text("Something went wrong", 500)
  })
  app.use(rateLimiter({
    windowMs: config.options.rateLimit.windowMs,
    limit: config.options.rateLimit.limit, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: "draft-6", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    keyGenerator: (c) => {
      // console.log("logging rate limiter")
      return c.req.raw.url
    },
  }))

  const prefix = config.options?.prefix ?? "/"
  app.get(prefix, (c) => {
    return c.text("Hi")
  })

  app.route(prefix, app.get("/public/*", serveStatic({})))
  app.route(prefix, app.get("/health", (c) => {
    return c.text("OK")
  }))

  app.route(prefix, await apiCatalog(repo))
  app.route(prefix, await apiData(repo))
  app.route(prefix, await apiStyle(repo))
  app.route(prefix, await apiPlayground(repo))

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
