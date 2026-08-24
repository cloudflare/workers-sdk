# 🤹 request-mocking

This Worker rewrites the host of all incoming requests to `cloudflare.com` then forwards the request on, except for the `/echo-ws` path which opens an outbound WebSocket. Tests demonstrate declarative request mocking with [MSW (Mock Service Worker)](https://mswjs.io/) via the [`@msw/cloudflare`](https://github.com/mswjs/cloudflare) integration, including outbound WebSocket connections.

| Test                                        | Worker invocation style       | Overview                                                                             |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| [direct.test.ts](test/direct.test.ts)       | `worker.fetch(req, env, ctx)` | Mocking HTTP requests with `http.get` / `http.post` handlers                         |
| [websocket.test.ts](test/websocket.test.ts) | `worker.fetch(req, env, ctx)` | Mocking outbound WebSocket connections (`new WebSocket(url)`) with the `ws.link` API |
| [exports.test.ts](test/exports.test.ts)     | `exports.default.fetch(...)`  | Mocking HTTP requests dispatched into a separate request I/O context                 |

`exports.test.ts` verifies that MSW handlers registered in the test runner also intercept requests dispatched through `exports.default.fetch(...)` into a separate request I/O context.
