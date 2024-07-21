import { argv, exit } from "node:process"
import { Command } from "commander"
import pkg from "../package.json"
import { initConfig, loadConfig } from "./config"
import { createServer } from "./server"

const program = new Command()

program
  .name(pkg.name)
  .description("rewrite attempt of tileserver-gl")
  .version(pkg.version)
  .command("run <config>")
  .description("run pengubin server with <config>")
  .action((config?: string) => {
    console.log("config file at ", config)
    loadConfig(config ?? "config.json")
      .then(config => createServer(config))
  })
  .addCommand(new Command("init")
    .description("init configuration file")
    .action((location?: string) => {
      initConfig(location ?? import.meta.dirname)
      exit(0)
    }))

program.parse(argv)
// const params = program.opts<{
//   config: string
// }>()
//
// loadConfig(params.config)
//   .then(config => createServer(config))
