export interface Provider {
  type: string
  getTile: (x: number, y: number, z: number) => Promise<Uint8Array | undefined>
  close: () => Promise<void>
}
