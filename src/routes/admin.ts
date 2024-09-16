import fp from "fastify-plugin"

import { Type } from "@sinclair/typebox"
import argon2 from "argon2"
import { badRequest, notFound } from "@hapi/boom"
import { omit } from "radash"
import type { FastifyTypeBoxInstance } from "../createServer"
import { userRepo } from "../infrastructure/db/repository/userRepo"
import { apiKeyRepo, serviceRepo } from "../infrastructure/db/repository"

export const apiAdminPlugin = fp(async (server, opt: {
  prefix: string
}) => {
  server.register(apiAdmin, { prefix: opt.prefix })
})

export async function apiAdmin(server: FastifyTypeBoxInstance) {
  server.post("/auth/access-token", {
    schema: {
      body: Type.Object({
        username: Type.String(),
        password: Type.String(),
      }),
    },
  }, async (req, _res) => {
    const {
      username,
      password,
    } = req.body

    const userFound = await userRepo.getUser(server.db, username)
    if (userFound == null) {
      throw badRequest()
    }

    const passwordValid = await argon2.verify(userFound.password, password)
    if (!passwordValid) {
      throw badRequest()
    }

    const token = server.jwt.sign({
      username,
    })

    return {
      tokenType: "Bearer",
      accessToken: token,
    }
  })

  server.get("/auth/userinfo", {
    onRequest: server.auth([server.verifyJWT]),
  }, async (req, _res) => {
    const user = await req.getJwtUser()
    return {
      username: user.username,
      roleId: user.roleId,
    }
  })

  await apiAdminApiKey(server)
  await apiAdminServices(server)
}

async function apiAdminApiKey(server: FastifyTypeBoxInstance) {
  server.get("/admin/api-keys", {
    onRequest: server.auth([server.verifyJWT]),
  }, async (req, _res) => {
    const user = await req.getJwtUser()
    const keys = await apiKeyRepo.getAll(server.db, user.id)

    return keys.map(key => omit(key, ["hashedKey"]))
  })

  server.post("/admin/api-keys", {
    schema: {
      body: Type.Object({
        serviceId: Type.Array(Type.Integer()),
      }),
    },
    onRequest: server.auth([server.verifyJWT]),
  }, async (req, res) => {
    const user = await req.getJwtUser()
    const key = await apiKeyRepo.createKey(server.db, user.id, req.body.serviceId)

    res.header("new-resource-id", key.id)
    return res.status(201).send()
  })

  server.patch("/admin/api-keys/{id}", {
    schema: {
      params: Type.Object({
        id: Type.Integer(),
      }),
      body: Type.Object({
        serviceId: Type.Array(Type.Integer()),
      }),
    },
    onRequest: server.auth([server.verifyJWT]),
  }, async (req, res) => {
    const user = await req.getJwtUser()
    const key = await apiKeyRepo.getById(server.db, req.params.id, user.id)
    if (key == null) {
      throw notFound()
    }

    await apiKeyRepo.updateService(server.db, req.params.id, req.body.serviceId)

    return res.status(201).send()
  })

  server.post("/admin/api-keys/{id}/refresh", {
    schema: {
      params: Type.Object({
        id: Type.Integer(),
      }),
      body: Type.Object({
        serviceId: Type.Array(Type.Integer()),
      }),
    },
    onRequest: server.auth([server.verifyJWT]),
  }, async (req, res) => {
    const user = await req.getJwtUser()
    const key = await apiKeyRepo.getById(server.db, req.params.id, user.id)
    if (key == null) {
      throw notFound()
    }

    await apiKeyRepo.refreshApiKey(server.db, req.params.id)

    return res.status(200).send()
  })
}

async function apiAdminServices(server: FastifyTypeBoxInstance) {
  server.get("/admin/services", {
    onRequest: server.auth([server.verifyJWT]),
  }, async (_req, _res) => {
    const services = await serviceRepo.getMany(server.db)

    return services.map(service => omit(service, ["config", "hash"]))
  })

  server.patch("/admin/services/{id}", {
    onRequest: server.auth([server.verifyJWT]),
    schema: {
      params: Type.Object({
        id: Type.Integer(),
      }),
      body: Type.Object({
        isPublic: Type.Boolean(),
      }),
    },
  }, async (req, res) => {
    await serviceRepo.setPublic(server.db, req.params.id, req.body.isPublic)
    return res.status(200).send()
  })

  server.delete("/admin/services/{id}", {
    onRequest: server.auth([server.verifyJWT]),
    schema: {
      params: Type.Object({
        id: Type.Integer(),
      }),
    },
  }, async (req, res) => {
    const service = await serviceRepo.getServiceById(server.db, req.params.id)
    if (service == null) {
      throw notFound()
    }

    await serviceRepo.delete(server.db, req.params.id)
    if (service.type === "DATA") {
      await server.repo.data.remove(service.name)
    }
    if (service.type === "STYLE") {
      const style = server.repo.style.get(service.name)!
      server.repo.style.delete(service.name)
      await style.pool.destroy()
    }

    return res.status(200).send()
  })
}
