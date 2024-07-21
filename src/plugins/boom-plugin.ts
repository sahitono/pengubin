import fp from "fastify-plugin"
import { isBoom } from "@hapi/boom"

// function fastifyErrorPage

export const boomPlugin = fp((fastify, options, next) => {
  fastify.setErrorHandler((error, request, reply) => {
    if (error && isBoom(error)) {
      reply
        .code(error.output.statusCode)
        .type("application/json")
        .headers(error.output.headers)
        .send(error.output.payload)

      return
    }

    reply.send(error || new Error(`Got non-error: ${error}`))
  })

  next()
}, {
  name: "fastify-boom",
})
