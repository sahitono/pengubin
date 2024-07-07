import { argv } from "node:process"
import { Command } from "commander"
import { loadConfig } from "./config"
import { createServer } from "./server"

const program = new Command()

program
  .name("ubin-server")
  .description("fork of tileserver-gl")
  .version("0.0.1-alpha")
  .option(
    "-c, --config <file>",
    "Configuration file",
    "config.json",
  )

program.parse(argv)
const params = program.opts<{ config: string }>()
loadConfig(params.config)
  .then(config => createServer(config))
