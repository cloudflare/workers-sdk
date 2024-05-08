import { env } from "cloudflare:test"
import { it, expect } from "vitest"

it("vitestFetchMocking: works as expected", async () => {
  const response = await env.WORKER.fetch("https://www.example.com/");
  expect(await response.text()).toBe("fetch mocked")
  expect(response.status).toBe(200)
})