import fp from "fastify-plugin"
import type { Repository, RepositoryRouteOption } from "../repository"
import type { AppDatabase } from "../infrastructure/db"
import { createDb } from "../infrastructure/db"

// Extend FastifyReply with the "fastify-url-data" plugin
declare module "fastify" {
  interface FastifyInstance {
    hasNoUser: boolean
    // db: Kysely<AppDatabase>
    db: AppDatabase
    // @ts-expect-error dont know why
    repo: Repository
  }
}

export const repositoryPlugin = fp((server, opt: RepositoryRouteOption, done) => {
  const { db, conn } = createDb(opt.repo.config.options.appConfigDatabase)
  server.log.info("Database registered")
  // @ts-expect-error dont know why
  server.decorate("repo", opt.repo)
  server.decorate("db", db)
  server.addHook("onClose", () => {
    server.log.info("Closing database...")
    conn.close()
  })
  server.log.info("Repository registered")
  done()
})
