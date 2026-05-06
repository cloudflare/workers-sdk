# 🤹 request-mocking

This Worker rewrites the host of all incoming requests to `cloudflare.com` then forwards the request on, except for the `/echo-ws` path which opens an outbound WebSocket. Tests demonstrate declarative request mocking with [MSW (Mock Service Worker)](https://mswjs.io/) via the [`@msw/cloudflare`](https://github.com/mswjs/cloudflare) integration, including outbound WebSocket connections.

| Test                                            | Overview                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| [declarative.test.ts](test/declarative.test.ts) | Mocking HTTP requests with `http.get` / `http.post` handlers                         |
| [websocket.test.ts](test/websocket.test.ts)     | Mocking outbound WebSocket connections (`new WebSocket(url)`) with the `ws.link` API |
