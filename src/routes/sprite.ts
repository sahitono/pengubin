import { notFound } from "@hapi/boom"
import { Type } from "@sinclair/typebox"
import type { FastifyTypeBoxInstance } from "../createServer"

export async function apiSprite(server: FastifyTypeBoxInstance) {
  const { sprite } = server.repo
  const getOrNotFound = (key?: string) => {
    const rendered = sprite.get(key ?? "default")
    if (rendered == null) {
      throw notFound("Sprite not found")
    }

    return rendered
  }

  server.get("/sprite", async (req, res) => {
    return res.send({
      image: `${req.protocol}://${req.hostname}${req.url}.png`,
      index: `${req.protocol}://${req.hostname}${req.url}.json`,
    })
  })

  server.get("/sprite.png", async (req, res) => {
    const rendered = getOrNotFound()
    res.header("content-type", "image/png")
    return res.send(rendered.image)
  })

  server.get("/sprite.json", async (req, res) => {
    const rendered = getOrNotFound()
    return res.send(rendered.sprite)
  })

  server.get("/sprite/:name", {
    schema: {
      params: Type.Object({
        name: Type.String(),
      }),
    },
  }, async (req, res) => {
    return res.send({
      image: `${req.protocol}://${req.hostname}${req.url}.png`,
      index: `${req.protocol}://${req.hostname}${req.url}.json`,
    })
  })

  server.get("/sprite/:name.png", {
    schema: {
      params: Type.Object({
        name: Type.String(),
      }),
    },
  }, async (req, res) => {
    const rendered = getOrNotFound(req.params.name)
    res.header("content-type", "image/png")
    return res.send(rendered.image)
  })

  server.get("/sprite/:name.json", {
    schema: {
      params: Type.Object({
        name: Type.String(),
      }),
    },
  }, async (req, res) => {
    const rendered = getOrNotFound(req.params.name)
    return res.send(rendered.sprite)
  })
}
