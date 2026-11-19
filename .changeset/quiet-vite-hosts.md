---
"@cloudflare/vite-plugin": minor
---

Add an experimental opt-in to trust Vite's allowed hosts for Local Explorer

Set `X_LOCAL_EXPLORER_USE_VITE_ALLOWED_HOSTS=true` to trust resolved `server.allowedHosts` and `preview.allowedHosts` entries for Local Explorer APIs and other `/cdn-cgi/` endpoints. Exact hostnames, suffix entries such as `.example.com`, and tunnel hostnames are supported. The environment variable defaults to `false`, keeping Vite's allowed hosts separate from Miniflare's allowlist. Setting Vite's `allowedHosts: true` keeps Miniflare's default protections enabled, even with the opt-in enabled.
