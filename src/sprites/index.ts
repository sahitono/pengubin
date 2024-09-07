import { readdir } from "node:fs/promises"
import { parse, resolve } from "node:path"
import type { Dirent } from "node:fs"
import type * as Buffer from "node:buffer"
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

const DEFAULT_SIZE = 64

export interface RenderedSprite {
  sprite: SpriteMerged
  image: Buffer
}

export type RenderedSprites = Record<string, RenderedSprite>

/**
 * Renders sprite images from a directory and packs them.
 *
 * @param opt - Options including the location of the sprites and optional scaling ratios.
 * @returns A promise that resolves to the rendered sprite sheets.
 */
export async function renderSprite({
  location,
  ratios = [1, 2],
}: {
  location: string
  ratios?: number[]
}): Promise<RenderedSprites> {
  const dirEntries = await readdir(location, { withFileTypes: true })

  // Filter files and map them with their metadata (width and height)
  const files = await Promise.all(
    dirEntries.filter(f => f.isFile()).map(async (file) => {
      const image = sharp(resolve(location, file.name))
      const {
        width = DEFAULT_SIZE,
        height = DEFAULT_SIZE,
      } = await image.metadata()
      return {
        id: file.name,
        path: file,
        width,
        height,
      }
    }),
  )

  // Sort files by height in descending order for optimal packing
  files.sort((a, b) => b.height - a.height)
  const renderedSprites: RenderedSprites = {}
  await Promise.all(
    ratios.map(
      async (ratio) => {
        renderedSprites[String(ratio)] = await processRatio(files, ratio, location)
      },
    ),
  )

  return renderedSprites
}

/**
 * Processes the files for each ratio, packs them, and generates the sprite sheets.
 *
 * @param files - The files to process.
 * @param ratio - The ratio to scale the files.
 * @param location - The directory location of the sprite files.
 * @returns The rendered sprites.
 */
async function processRatio(
  files: Array<{
    id: string
    path: Dirent
    width: number
    height: number
  }>,
  ratio: number,
  location: string,
): Promise<RenderedSprite> {
  const scaledFiles = files.map(file => ({
    ...file,
    width: Math.round(file.width * ratio),
    height: Math.round(file.height * ratio),
  }))

  const shelf = new ShelfPack(1, 1, { autoResize: true })
  const packedBins = shelf.pack(scaledFiles)

  const sprite: SpriteMerged = {}
  const composites = await Promise.all(
    packedBins.map(async (bin) => {
      const file = scaledFiles.find(f => f.id === bin.id)!
      sprite[parse(file.id).name] = {
        width: bin.w,
        height: bin.h,
        x: bin.x,
        y: bin.y,
        pixelRatio: ratio,
      }

      return {
        input: await sharp(resolve(location, file.id))
          .resize({
            width: bin.w,
            height: bin.h,
          })
          .toBuffer(),
        top: bin.y,
        left: bin.x,
      }
    }),
  )

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

  const buffer = await canvas.composite(composites).png().toBuffer()

  return {
    sprite,
    image: buffer,
  }
}
