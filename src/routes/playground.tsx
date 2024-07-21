import { Hono } from "hono"
import type { Repository } from "../repository"
import { MapComponent } from "../views/playground"

export async function apiPlayground({ data, style }: Repository) {
  const app = new Hono()

  app.get("/playground", async (c, next) => {
    return c.html(
      <MapComponent />,
    )
  })

  return app
}
