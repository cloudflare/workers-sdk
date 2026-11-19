---
"miniflare": patch
"@cloudflare/vite-plugin": minor
---

Allow Local Explorer access through localhost subdomains and opt-in Vite hosts

Miniflare now trusts `*.localhost` for `/cdn-cgi/` requests. The Vite plugin keeps its allowed hosts separate by default. Set the experimental environment variable `X_LOCAL_EXPLORER_USE_VITE_ALLOWED_HOSTS=true` to also trust resolved `server.allowedHosts` and `preview.allowedHosts` entries, including exact hostnames, suffix entries such as `.example.com`, and tunnel hostnames. This grants those hosts access to Local Explorer APIs and other `/cdn-cgi/` endpoints. The environment variable defaults to `false`. Setting Vite's `allowedHosts: true` keeps Miniflare's default protections enabled, even with the opt-in enabled.
