export type Bounds = [number, number, number, number]
export type Center = [number, number]

export interface TileJSON extends Record<string, unknown> {
  tilejson: "2.0.0" | string
  name?: string
  description?: string
  version?: string
  attribution?: string
  template?: string
  legend?: string
  scheme?: "xyz" | "tms"
  tiles: string[]
  grids?: string[]
  data?: string[]
  minzoom?: number
  maxzoom?: number
  bounds?: Bounds // [west, south, east, north]
  center?: Center // [longitude, latitude, zoom]
}
