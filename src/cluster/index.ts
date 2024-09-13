import cluster from "node:cluster"
import process from "node:process"
import * as os from "node:os"
import consola from "consola"
import type { NonNullableConfig } from "../config/schema"
import { startServer } from "../server"

export class Cluster {
  readonly config: NonNullableConfig
  readonly clusterCount: number

  constructor(config: NonNullableConfig, clusterCount: number = 2) {
    this.config = config
    if (clusterCount >= os.cpus().length) {
      consola.error(`Cluster should below cpu core of ${os.cpus().length}`)
      process.exit(1)
    }
    this.clusterCount = clusterCount
  }

  run() {
    if (cluster.isPrimary) {
      this.master()
    }
    else {
      this.worker()
    }
  }

  private master() {
    consola.info(`Running in cluster mode at ${this.clusterCount} clusters`)
    console.log("Master %o is running", process.pid)

    for (let i = 0; i < this.clusterCount; i++) {
      const fork = cluster.fork()
      fork.on("online", () => {
        fork.send(i)
      })
    }

    cluster.on("online", (worker) => {
      console.log("Worker %o is listening", worker.process.pid)
    })

    cluster.on("exit", (worker) => {
      console.log("Worker %o died", worker.process.pid)
    })
  }

  private async worker() {
    consola.info(`Running worker at ${process.pid}`)
    try {
      await startServer(this.config)
    }
    catch (e) {
      consola.error(e)
      process.exit(1)
    }
  }
}
