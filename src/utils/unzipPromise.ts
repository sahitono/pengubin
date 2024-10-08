import type { InputType } from "node:zlib"
import { unzip } from "node:zlib"

export function unzipPromise(data: InputType): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, result) => {
      if (error != null) {
        reject(error)
      }

      return resolve(result)
    })
  })
}
