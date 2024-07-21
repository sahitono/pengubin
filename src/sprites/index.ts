import { readdir } from "node:fs/promises"
import { resolve } from "node:path"
import type { Dirent } from "node:fs"
import sharp from "sharp"
import ShelfPack from "@mapbox/shelf-pack"

export interface SpritePosition {
  height: number
  pixelRatio: number
  width: number
  x: number
  y: number
}

export type SpriteMerged = Record<string, SpritePosition>

const DEFAULT_SIZE = 64 as const

export async function renderSprite(opt: {
  location: string
  ratios?: number[]
}): Promise<{
    sprite: SpriteMerged
    image: Buffer
  }> {
  const dirents = await readdir(opt.location, { withFileTypes: true })
  const files: {
    width: number
    height: number
    path: Dirent
    id: string
  }[] = await Promise.all(dirents.filter(f => f.isFile()).map(async (f) => {
    const im = sharp(resolve(f.parentPath, f.name))
    const meta = await im.metadata()
    return {
      width: meta?.width ?? DEFAULT_SIZE,
      height: meta?.height ?? DEFAULT_SIZE,
      path: f,
      id: f.name,
    }
  }))
  files.sort((a, b) => b.height - a.height)
  const images = files.map(f => sharp(resolve(f.path.parentPath, f.path.name), {}))

  const shelf = new ShelfPack(1, 1, { autoResize: true })
  const packed = shelf.pack(files)

  const canvas = sharp({
    create: {
      width: shelf.w,
      height: shelf.h,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    },
  })

  const sprite: SpriteMerged = {}

  const composites: sharp.OverlayOptions[] = await Promise.all(packed.map(async (bin) => {
    const fileIndex = files.findIndex(f => f.id === bin.id)!
    sprite[String(bin.id)] = {
      width: bin.w,
      height: bin.h,
      y: bin.y,
      x: bin.x,
      pixelRatio: 1,
    }

    return {
      input: await images[fileIndex].toBuffer(),
      top: bin.y,
      left: bin.x,
    }
  }))

  const composited = canvas.composite(composites).toFormat("png")
  const buffer = await composited.toBuffer()

  return {
    sprite,
    image: buffer,
  }
}
