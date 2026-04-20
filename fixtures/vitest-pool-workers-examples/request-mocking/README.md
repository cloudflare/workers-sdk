# 🤹 request-mocking

This Worker rewrites the host of all incoming requests to `cloudflare.com` then forwards the request on. Tests demonstrate declarative mocking with [MSW (Mock Service Worker)](https://mswjs.io/), and imperative mocks of `globalThis.fetch()`. Note mocking WebSocket requests is only supported with imperative mocking.

| Test                                            | Overview                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| [declarative.test.ts](test/declarative.test.ts) | Integration tests with declarative request mocking using MSW            |
| [imperative.test.ts](test/imperative.test.ts)   | Integration tests with imperative request mocking, including WebSockets |
