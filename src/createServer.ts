import type { FastifyServerOptions } from "fastify"
import fastify from "fastify"
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox"

/**
 * Used to provide type safety for Fastify Instance easier
 */
export function createServer() {
  const env = process.env.NODE_ENV || "development"

  return fastify({
    logger: envToLogger[env],
    trustProxy: true,
  }).withTypeProvider<TypeBoxTypeProvider>()
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
  },
  production: true,
  test: false,
}

export type FastifyTypeBoxInstance = ReturnType<typeof createServer>
