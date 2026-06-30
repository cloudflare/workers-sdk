---
"@cloudflare/remote-bindings": minor
---

Add `@cloudflare/remote-bindings`, a standalone package that powers remote bindings during local development without depending on `wrangler`.

It exposes `startRemoteProxySession`, `maybeStartOrUpdateRemoteProxySession`, and `pickRemoteBindings`, replacing the previous DevEnv-based proxy with a lightweight, direct edge-preview API client plus a minimal Node.js HTTP/WebSocket proxy.

Auth is customisable: by default `createEnvAuthResolver` reads `CLOUDFLARE_*` credentials or refreshes the stored OAuth token discovered via the environment, so a top-level CLI can delegate remote bindings down a `cf dev → vite dev → @cloudflare/remote-bindings` chain and have tokens refreshed mid-run. Everything needed is configurable through environment variables: `CLOUDFLARE_CONFIG_DIR` / `CLOUDFLARE_AUTH_CONFIG_FILE` (token location and format, TOML or JSON), `CLOUDFLARE_OAUTH_CLIENT_ID` (the app to refresh with), `CLOUDFLARE_ALLOW_GLOBAL_API_KEY`, and `CLOUDFLARE_LOGIN_COMMAND`. Consumers calling the package directly can also inject their own credentials, auth-config file location, client ID, or `loginHint`.

When no credentials are available and no stored token can be refreshed (e.g. the user hasn't logged in yet), the resolver fails fast with a clear, CLI-agnostic message — it never attempts an interactive login, since the top-level CLI owns authentication.
