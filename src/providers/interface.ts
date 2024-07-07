export interface XYZProvider {
  type: string
  format: string
  init: () => Promise<void>
  getTile: (x: number, y: number, z: number) => Promise<Uint8Array | undefined>
  updateTile: (x: number, y: number, z: number, tile: Uint8Array) => Promise<void>
  getMetadata: () => Promise<XYZProviderMetadata>
  setMetadata: (metadata: XYZProviderMetadata) => Promise<void>
  close: () => Promise<void>
}

export interface XYZProviderMetadata extends Record<string, unknown> {
  name: string
  bounds: [number, number, number, number]
  minzoom: number
  maxzoom: number
  format: "pbf" | "png" | string
  json?: {
    vector_layers: XYZMetadataLayerInfo[]
  }
  attribution?: string
  type?: "overlay" | "baselayer"
  version?: number
}

export type XYZMetadataVectorLayerFieldType = "Number" | "Boolean" | "String"
interface XYZMetadataLayerInfo {
  id: string
  fields: Record<string, XYZMetadataVectorLayerFieldType>
  description?: string
  minzoom?: string
  maxzoom?: string
}
