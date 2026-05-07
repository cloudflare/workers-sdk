# 🤹 request-mocking

This Worker rewrites the host of all incoming requests to `cloudflare.com` then forwards the request on, except for the `/echo-ws` path which opens an outbound WebSocket. Tests demonstrate declarative request mocking with [MSW (Mock Service Worker)](https://mswjs.io/) via the [`@msw/cloudflare`](https://github.com/mswjs/cloudflare) integration, including outbound WebSocket connections.

| Test                                        | Worker invocation style       | Overview                                                                             |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| [direct.test.ts](test/direct.test.ts)       | `worker.fetch(req, env, ctx)` | Mocking HTTP requests with `http.get` / `http.post` handlers                         |
| [websocket.test.ts](test/websocket.test.ts) | `worker.fetch(req, env, ctx)` | Mocking outbound WebSocket connections (`new WebSocket(url)`) with the `ws.link` API |
| [exports.test.ts](test/exports.test.ts)     | `exports.default.fetch(...)`  | **Currently expected to fail** — upstream MSW bug with cross-request I/O contexts    |

`exports.test.ts` is a minimal repro for an upstream MSW issue. MSW 2.14+ creates an `AbortController` inside `defineNetwork().enable()` and passes its signal to per-frame listeners during request dispatch. When dispatch happens in a different request context (which is what `exports.default.fetch(...)` does on workerd), reading the signal throws `Cannot perform I/O on behalf of a different request`. See the comment block at the top of `exports.test.ts` for the full analysis. The tests use `it.fails` so the suite stays green while the bug exists; once the upstream fix lands, change them to `it`.
