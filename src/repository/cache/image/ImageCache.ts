import fnv1a from "@sindresorhus/fnv1a"

export interface ImageStore {
  set: (group: string, x: number, y: number, z: number, hash: string, value: Uint8Array, ttl: number, otherValue: string) => Promise<void>
  get: (group: string, x: number, y: number, z: number, otherValue: string) => Promise<Uint8Array | undefined>
  delete: (group: string, x: number, y: number, z: number, otherValue: string) => Promise<void>
  deleteAll: (group?: string) => Promise<void>
  getByHash: (hash: string) => Promise<Uint8Array | undefined>
  reset: () => Promise<void>
}

export class ImageCache<S extends ImageStore> {
  store: S
  ttl: number

  constructor(opt: {
    store: S
    ttl: number
  }) {
    this.store = opt.store
    this.ttl = opt.ttl
  }

  async set(group: string, x: number, y: number, z: number, value: Uint8Array, otherValue: string = ""): Promise<void> {
    const hashKey = Number(fnv1a(`${group}-${x}-${y}-${z}-${otherValue}`))
    await this.store.set(group, x, y, z, String(hashKey), value, this.ttl, otherValue)
  }

  async get(group: string, x: number, y: number, z: number, otherValue: string = ""): Promise<Uint8Array | undefined> {
    return await this.store.get(group, x, y, z, otherValue)
  }

  async deleteAll(group?: string): Promise<void> {
    return await this.store.deleteAll(group)
  }
}
