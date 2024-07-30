import type { Geometry } from "geojson"

export interface FeatureProvider {
  type: string
  init: () => Promise<void>
  close: () => Promise<void>
}

export interface FeatureTable {
  tableName: string
  geometryType: Geometry
  srId: number
}
