import { argv, exit } from "node:process"
import { Argument, Command, Option } from "commander"
import { get } from "radash"
import consola from "consola"
import type { Bounds } from "@pengubin/core"
import pkg from "../package.json"
import type { SupportedExtension } from "./config"
import { initConfig, loadConfig } from "./config"
import { startServer } from "./server"
import { start as startWeb2MBTiles } from "./app/web2mbtiles"

const program = new Command()

program
  .name(pkg.name)
  .description("rewrite attempt of tileserver-gl")
  .version(pkg.version)
  .command("run <config>")
  .description("run pengubin server with <config>")
  .action((config?: string) => {
    loadConfig(config ?? "config.json")
      .then(config => startServer(config))
  })
  .addCommand(new Command("web2mbtiles")
    .description("dump web xyz to mbtiles")
    .addArgument(new Argument("<location>", "location of mbtiles").argRequired())
    .addArgument(new Argument("<url>", "xyz url").argRequired())
    .addOption(new Option("-minz, --min-zoom <zoom>", "minimum zoom").default("0"))
    .addOption(new Option("-maxz, --max-zoom <zoom>", "minimum zoom").default("20"))
    .addOption(new Option("-b, --bounds <bbox>", "long lat bounding box").default("-90,-180,90,180"))
    .action((location: string, url: string, options) => {
      startWeb2MBTiles({
        concurrency: 0,
        tileSize: 512,
        target: location,
        url,
        minZoom: Number.parseFloat(get<string>(options, "minZoom")),
        maxZoom: Number.parseFloat(get<string>(options, "maxZoom")),
        bounds: get<string>(options, "bounds").split(",").map(d => Number.parseFloat(d)) as Bounds,
      }).then(() => {
        exit(0)
      }).catch((e) => {
        consola.error(e)
        exit(1)
      })
    }),
  )

program.command("init").description("init configuration file")
  .description("init configuration file")
  .addArgument(new Argument("<location>", "location of mbtiles").argRequired())
  .addOption(new Option("-f, --format <format>", "json or toml").default("toml"))
  .action((location?: string, opt?: { format?: SupportedExtension }) => {
    initConfig(location ?? import.meta.dirname, opt?.format)
    exit(0)
  })

program.command("web2mbtiles").description("dump web xyz to mbtiles")
  .addArgument(new Argument("<location>", "location of mbtiles").argRequired())
  .addArgument(new Argument("<url>", "xyz url").argRequired())
  .addOption(new Option("-minz, --min-zoom <zoom>", "minimum zoom").default("0"))
  .addOption(new Option("-ts, --tile-size <size>", "tile size").choices(["256", "512"]).default("512"))
  .addOption(new Option("-maxz, --max-zoom <zoom>", "minimum zoom").default("20"))
  .addOption(new Option("-b, --bounds <bbox>", "long lat bounding box").default("-90,-180,90,180"))
  .addOption(new Option("-c, --concurrency <concurrency>", "concurrency processing").default(1))
  .action((location: string, url: string, options) => {
    startWeb2MBTiles({
      concurrency: Number.parseInt(get<string>(options, "concurrency")),
      tileSize: Number.parseInt(get<string>(options, "tileSize")),
      target: location,
      url,
      minZoom: Number.parseFloat(get<string>(options, "minZoom")),
      maxZoom: Number.parseFloat(get<string>(options, "maxZoom")),
      bounds: get<string>(options, "bounds").split(" ").map(d => Number.parseFloat(d)) as Bounds,
    }).then(() => {
      exit(0)
    }).catch((e) => {
      consola.error(e)
      exit(1)
    })
  })

program.parse(argv)
