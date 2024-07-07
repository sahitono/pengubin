import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec"

export const style = {
  version: 8,
  sources: {
    // darkOSM: {
    //   type: "raster",
    //   tiles: [
    //     "https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=sSR8vafAaXnhfZxJmuiZ",
    //   ],
    // },
    // citata: {
    //   type: "raster",
    //   url: "http://localhost:3010/bapenda-smartmap-citata",
    // },
    pbb: {
      type: "vector",
      // url: "mbtiles://localhost:3010/bapenda-smartmap-pbb",
      tiles: [
        "mbtiles://bapenda-smartmap-pbb/{z}/{x}/{y}.pbf",
      ],
      // maxzoom: 15,
      // minzoom: 8,
    },
  },
  layers: [
    // {
    //   id: "basemap",
    //   source: "darkOSM",
    //   type: "raster",
    // },
    // {
    //   id: "basemap--citata",
    //   source: "citata",
    //   type: "raster",
    // },
    {
      "id": "pbb",
      "type": "line",
      "source": "pbb",
      "source-layer": "bidang_pbb_4326",
      "layout": { visibility: "visible" },
      "paint": {
        "line-color": [
          "match",
          ["length", ["coalesce", ["get", "NOP"], ""]],
          0,
          "#ff0000",
          "#00ff00",
        ],
      },
    },
  ],
} as StyleSpecification
