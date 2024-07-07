import type { Context, MiddlewareHandler } from "hono"
import { caching } from "cache-manager"
import { sqliteStore } from "@resolid/cache-manager-sqlite"
import consola from "consola"

const TTL = 100 * 1000

export async function cache(options: {
  cacheControl?: string
  vary?: string | string[]
  isBinary?: boolean
  ttl?: number
} = {}): Promise<MiddlewareHandler> {
  const inSqlite = options?.isBinary ?? false

  const cacheHandler = inSqlite
    ? await caching(sqliteStore({
      ttl: TTL,
      cacheTableName: "caches",
      enableWALMode: true,
      sqliteFile: "./caches.sqlite",
      onBackgroundRefreshError: (err) => {
        consola.debug(err)
        consola.error("Failed to refresh cache")
      },
    }))
    : await caching("memory", {
      max: 1000,
      ttl: options?.ttl ?? TTL, /* milliseconds */
      shouldCloneBeforeSet: false,
    })

  cacheHandler.on("error", (err) => {
    console.error(err)
  })

  const cacheControlDirectives = options.cacheControl
    ?.split(",")
    .map(directive => directive.toLowerCase())
  const varyDirectives = Array.isArray(options.vary)
    ? options.vary
    : options.vary?.split(",").map(directive => directive.trim())
  // RFC 7231 Section 7.1.4 specifies that "*" is not allowed in Vary header.
  // See: https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.4
  if (options.vary?.includes("*")) {
    throw new Error(
      "Middleware vary configuration cannot include \"*\", as it disallows effective caching.",
    )
  }

  const addHeader = (c: Context) => {
    if (cacheControlDirectives) {
      const existingDirectives
        = c.res.headers
          .get("Cache-Control")
          ?.split(",")
          .map(d => d.trim().split("=", 1)[0]) ?? []
      for (const directive of cacheControlDirectives) {
        let [name, value] = directive.trim().split("=", 2)
        name = name.toLowerCase()
        if (!existingDirectives.includes(name)) {
          c.header("Cache-Control", `${name}${value ? `=${value}` : ""}`, { append: true })
        }
      }
    }

    if (varyDirectives) {
      const existingDirectives
        = c.res.headers
          .get("Vary")
          ?.split(",")
          .map(d => d.trim()) ?? []

      const vary = Array.from(
        new Set(
          [...existingDirectives, ...varyDirectives].map(directive => directive.toLowerCase()),
        ),
      ).sort()

      if (vary.includes("*")) {
        c.header("Vary", "*")
      }
      else {
        c.header("Vary", vary.join(", "))
      }
    }
  }

  return async function cache(c, next) {
    const key = c.req.url

    const cachedResponse = await cacheHandler.get<Response>(key)
    if (cachedResponse) {
      return new Response(cachedResponse.body, cachedResponse)
    }

    await next()
    if (!c.res.ok) {
      return
    }

    addHeader(c)

    const res = c.res.clone()
    await cacheHandler.set(key, res)
  }
}
