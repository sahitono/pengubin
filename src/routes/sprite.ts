import { notFound } from "@hapi/boom"
import { Type } from "@sinclair/typebox"
import type { FastifyTypeBoxInstance } from "../createServer"
import type { RenderedSprite } from "../sprites"

export async function apiSprite(server: FastifyTypeBoxInstance) {
  const { sprite } = server.repo
  const getOrNotFound = (key?: string, ratio: string = "1"): RenderedSprite => {
    const rendered = sprite.get(key ?? "default")
    if (rendered == null) {
      throw notFound("Sprite not found")
    }

    if (!Object.hasOwn(rendered, ratio)) {
      throw notFound("Sprite ratio not found")
    }

    return rendered[ratio]
  }

  const extractName = (pathName: string): { name: string, ratio: string } => {
    const names = pathName.split("@")
    const name = names[0]
    const ratio = names.length > 1 ? names[1].replaceAll("x", "") : "1"
    return {
      name,
      ratio,
    }
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
    const path = extractName(req.params.name)
    const rendered = getOrNotFound(path.name, path.ratio)

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
    const path = extractName(req.params.name)
    const rendered = getOrNotFound(path.name, path.ratio)
    return res.send(rendered.sprite)
  })
}
