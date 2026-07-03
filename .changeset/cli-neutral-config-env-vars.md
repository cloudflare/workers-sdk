---
"@cloudflare/workers-utils": minor
---

Recognise CLI-neutral `CLOUDFLARE_`-prefixed auth/config environment variables so a top-level CLI can drive delegated tools (the Vite plugin, `@cloudflare/remote-bindings`) without setting `WRANGLER_`-prefixed ones.

- `CLOUDFLARE_CONFIG_DIR` pins the global config directory (so delegated tools resolve the same OAuth token).
- `CLOUDFLARE_AUTH_CONFIG_FILE`, `CLOUDFLARE_OAUTH_CLIENT_ID`, `CLOUDFLARE_ALLOW_GLOBAL_API_KEY`, and `CLOUDFLARE_LOGIN_COMMAND` configure delegated auth resolution.
