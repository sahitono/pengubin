import { Buffer } from "node:buffer"
import colorParse from "color-parse"
import sharp from "sharp"

const cachedEmptyResponses: Record<string, Uint8Array> = {
  "": Buffer.alloc(0),
}

export type ValidFormat = "pbf" | "jpg" | "jpeg" | "png"

export async function createEmptyResponse(format: ValidFormat, color: string = "rgba(255,255,255,0)"): Promise<Uint8Array> {
  if (!format || format === "pbf") {
    return cachedEmptyResponses[""]
  }

  if (format === "jpg") {
    format = "jpeg"
  }

  const cacheKey = `${format},${color}`
  const data = cachedEmptyResponses[cacheKey]
  if (data) {
    return data
  }

  // create an "empty" response image
  const parsed = colorParse(color)
  const array = parsed.values
  const channels = array.length === 4 && format !== "jpeg" ? 4 : 3
  return await sharp(Buffer.from(array), {
    raw: {
      width: 1,
      height: 1,
      channels,
    },
  })
    .toFormat(format)
    .toBuffer()
}
