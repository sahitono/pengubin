import type { FastifyRequest } from "fastify"
import { get } from "radash"
import fp from "fastify-plugin"
import { badGateway, badRequest, forbidden, notFound } from "@hapi/boom"
import argon2 from "argon2"
import { apiKeyRepo, serviceRepo } from "../infrastructure/db/repository"

export function getApiKey(req: FastifyRequest): { prefix: string, key: string } | undefined {
  const key = get<string>(req.query, "key") ?? req.headers.authorization
  const keys = key.split(".")
  return {
    prefix: keys[0],
    key: keys[1],
  }
}

export const authApiKeyPlugin = fp(async (server, opt: {
  type?: string
}) => {
  server.addHook("onRequest", async (req, _res) => {
    const key = getApiKey(req)
    const name = get<string>(req.params, "name")

    // Handle non-service routes (no `name` param)
    if (name == null) {
      if (key == null) {
        throw badRequest("missing API key for non-service route")
      }

      // Validate the API key
      const apiKey = await apiKeyRepo.getValidKey(server.db, key.prefix)
      if (apiKey == null || !(await argon2.verify(apiKey.hashedKey, key.key))) {
        throw forbidden("invalid API key for non-service route")
      }

      return // Valid key for non-service route, proceed
    }

    if (!opt.type) {
      throw badGateway("service type is missing")
    }
    const service = await serviceRepo.getService(server.db, name, opt.type)
    if (!service) {
      throw notFound("service not found")
    }

    if (service.isPublic && !key) {
      return
    }

    if (!key) {
      throw badRequest("missing API key")
    }

    const apiKey = await apiKeyRepo.getValidKey(server.db, key.prefix)
    if (apiKey == null) {
      throw forbidden()
    }
    const valid = await argon2.verify(apiKey.hashedKey, key.key)
    if (!valid && !service.isPublic) {
      throw forbidden("invalid API key")
    }
  })
})
