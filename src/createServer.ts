import { createRequire } from "node:module"
import process from "node:process"
import type { FastifyServerOptions } from "fastify"
import fastify from "fastify"
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox"

const require = createRequire(import.meta.url)

function moduleIsAvailable(path: string) {
  try {
    require.resolve(path)
    return true
  }
  catch (e) {
    return false
  }
}

const envToLogger: Record<string, FastifyServerOptions["logger"]> = {
  development: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
        colorize: true,
      },
    },
    level: "debug",
  },
  production: true,
  test: false,
}

/**
 * Used to provide type safety for Fastify Instance easier
 */
export function createServer() {
  const env = process.env.NODE_ENV || "development"

  const hasPinoPretty = moduleIsAvailable("pino-pretty")

  return fastify({
    logger: hasPinoPretty ? envToLogger[env] : true,
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>()
}

export type FastifyTypeBoxInstance = ReturnType<typeof createServer>
