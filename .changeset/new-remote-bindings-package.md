---
"@cloudflare/remote-bindings": minor
---

Add the standalone `@cloudflare/remote-bindings` package: a lightweight, `wrangler`-free implementation of remote binding proxy sessions (direct edge-preview API calls plus a minimal Node HTTP/WebSocket proxy and a pre-bundled `ProxyServerWorker`).

Auth is customisable and environment-driven: `createEnvAuthResolver` reads `CLOUDFLARE_*` credentials or refreshes the stored OAuth token discovered via `CLOUDFLARE_CONFIG_DIR` / `CLOUDFLARE_AUTH_CONFIG_FILE`, using `CLOUDFLARE_OAUTH_CLIENT_ID` and honouring `CLOUDFLARE_ALLOW_GLOBAL_API_KEY`. It is refresh-only and never starts an interactive login, failing with an actionable `CLOUDFLARE_LOGIN_COMMAND` hint instead.
