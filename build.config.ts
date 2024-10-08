import { defineBuildConfig } from "unbuild"

export default defineBuildConfig({
  entries: [
    "src/cli",
    "src/index",
    "src/providers/index",
  ],
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
    json: {
      compact: true,
      namedExports: false,
      preferConst: false,
    },
    commonjs: {
      requireReturnsDefault: "auto",
    },
    dts: {
      respectExternal: false,
    },
  },
  clean: true,
  declaration: true,
})
