import fastifyAuth from "@fastify/auth"
import fastifyJwt from "@fastify/jwt"
import fp from "fastify-plugin"
import type { FastifyReply, FastifyRequest } from "fastify"
import { badGateway, badRequest, forbidden, notFound, unauthorized } from "@hapi/boom"
import { get } from "radash"
import argon2 from "argon2"
import { apiKeyRepo, serviceRepo } from "../infrastructure/db/repository"
import { userRepo } from "../infrastructure/db/repository/userRepo"

export interface JWTPayload {
  username: string
}

declare module "fastify" {
  interface FastifyInstance {
    verifyJWT: (req: FastifyRequest, res: FastifyReply) => Promise<void>
    verifyApiKey: (req: FastifyRequest, res: FastifyReply) => Promise<void>
    verifyAll: (req: FastifyRequest, res: FastifyReply) => Promise<void>
  }

  interface FastifyRequest {
    getJwtPayload: () => JWTPayload
    getJwtUser: () => Promise<NonNullable<Awaited<ReturnType<typeof userRepo["getUser"]>>>>
    getApiKey: () => ReturnType<typeof getApiKey>
  }
}

function getApiKey(req: FastifyRequest): {
  prefix: string
  key: string
} | undefined {
  const key = get<string>(req.query, "key") ?? get(req.headers, "x-api-key")
  if (key == null) {
    return
  }

  const keys = key.split(".")
  return {
    prefix: keys[0],
    key: keys[1],
  }
}

export const authPlugin = fp(async (server, opt: {
  secret?: string
}) => {
  server.register(fastifyAuth)
  server.register(fastifyJwt, {
    // @ts-expect-error wrong typing
    secret: opt.secret ?? server.repo.config.options.secret,
    verify: {
      maxAge: "12h",
    },
  })

  server.decorateRequest("getJwtPayload", () => {
    throw badGateway()
  })
  server.decorateRequest("getJwtUser", async () => {
    throw badGateway()
  })

  server.decorateRequest("getApiKey", () => {
    throw badGateway()
  })

  const verifyJWT = async (req: FastifyRequest, _res: FastifyReply) => {
    const token = req.headers.authorization?.replaceAll("Bearer ", "")
    if (token == null) {
      throw unauthorized()
    }

    try {
      const result = await req.jwtVerify({
        key: token,
      })
      if (typeof result === "string") {
        throw unauthorized()
      }

      req.getJwtPayload = () => result as JWTPayload
      req.getJwtUser = async () => {
        const decoded = req.getJwtPayload()

        const user = await userRepo.getUser(server.db, decoded.username)
        if (user == null) {
          throw unauthorized()
        }

        return user
      }
    }
    catch {
      throw unauthorized()
    }
  }
  server.decorate("verifyJWT", verifyJWT)

  const verifyApiKey = async (req: FastifyRequest, _res: FastifyReply) => {
    const token = getApiKey(req)
    req.getApiKey = () => token

    const name = get<string>(req.params, "name")
    if (name == null) {
      if (token == null) {
        throw badRequest("missing API key for non-service route")
      }

      // Validate the API key
      const apiKey = await apiKeyRepo.getValidKey(server.db, token.prefix)
      if (apiKey == null || !(await argon2.verify(apiKey.hashedKey, token.key))) {
        throw forbidden("invalid API key")
      }

      return // Valid key for non-service route, proceed
    }

    const typeInUrl = req.url.match(new RegExp(`\\/([^\\/]+)\\/${name}`))

    if (typeInUrl == null) {
      throw badGateway("service type is missing")
    }
    const service = await serviceRepo.getService(server.db, name, typeInUrl[1])
    if (!service) {
      throw notFound("service not found")
    }

    if (service.isPublic && !token) {
      return
    }

    if (!token) {
      throw badRequest("missing API key")
    }

    const apiKey = await apiKeyRepo.getValidKey(server.db, token.prefix)
    if (apiKey == null) {
      throw forbidden()
    }
    const valid = await argon2.verify(apiKey.hashedKey, token.key)
    if (!valid && !service.isPublic) {
      throw forbidden("invalid API key")
    }
  }
  server.decorate("verifyApiKey", verifyApiKey)

  server.decorate("verifyAll", async (req: FastifyRequest, res: FastifyReply) => {
    const results = await Promise.allSettled([verifyJWT(req, res), verifyApiKey(req, res)])
    const valid = results.filter(res => res.status === "fulfilled")
    if (valid.length < 1) {
      throw unauthorized()
    }
  })
})
