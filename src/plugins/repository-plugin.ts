import fp from "fastify-plugin"
import type { Repository, RepositoryRouteOption } from "../repository"

// Extend FastifyReply with the "fastify-url-data" plugin
declare module "fastify" {
  interface FastifyInstance {
    repo: Repository
  }
}

export const repositoryPlugin = fp((server, opt: RepositoryRouteOption, done) => {
  server.decorate("repo", opt.repo)
  server.log.info("Registered repository")
  done()
})
