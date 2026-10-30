# Local preview prototype (RM-31812)

**Prototype for discussion, not for release.** It shows a wrangler-free successor to `createTestHarness`, split into three pieces that address a running runtime by URL:

| Piece                           | What it does                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPreviewServer({ root })` | Reads cf / Vite v2 build output (`.cloudflare/output/v0`) and starts Miniflare. A thin wrapper that keeps Miniflare out of the public API. Name not final.                                                                                        |
| `connectBindings(connection)`   | A Worker's `env` and default entrypoint, from this process or another one. Uses the same implementation as `Miniflare#getBindings()`.                                                                                                             |
| `createExplorerClient(url)`     | A client for the Local Explorer API, generated from its OpenAPI spec, with a hand-written layer on top. It sends requests to a specific Worker, and covers cron, KV, D1 (migrations with an optional `dir`), and Durable Object SQL and eviction. |

The tests compose the three directly, without a `createTestHarness` wrapper.

```sh
pnpm test:ci   # generates the client, builds the fixture with `wrangler build`, runs vitest
```
