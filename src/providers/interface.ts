export interface Provider {
  type: string
  format: string
  init: () => Promise<void>
  getTile: (x: number, y: number, z: number) => Promise<Uint8Array | undefined>
  updateTile: (x: number, y: number, z: number, tile: Uint8Array) => Promise<void>
  getMetadata: () => Promise<ProviderMetadata>
  setMetadata: (metadata: ProviderMetadata) => Promise<void>
  close: () => Promise<void>
}

export interface ProviderMetadata extends Record<string, unknown> {
  name: string
  bounds: [number, number, number, number]
  minzoom: number
  maxzoom: number
  format: "pbf" | "png" | string
  json?: {
    vector_layers: MetadataLayerInfo[]
  }
  attribution?: string
  type?: "overlay" | "baselayer"
  version?: number
}

interface MetadataLayerInfo {
  id: string
  fields: Record<string, "Number" | "Boolean" | "String">[]
  description?: string
  minzoom?: string
  maxzoom?: string
}
