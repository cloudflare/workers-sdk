---
"miniflare": patch
"@cloudflare/vite-plugin": minor
---

Allow Local Explorer access through localhost subdomains and opt-in Vite hosts

Miniflare now trusts `*.localhost` for `/cdn-cgi/` requests. The Vite plugin keeps its allowed hosts separate by default. Set `cloudflare({ localExplorer: { useViteAllowedHosts: true } })` to also trust resolved `server.allowedHosts` and `preview.allowedHosts` entries, including exact hostnames, suffix entries such as `.example.com`, and tunnel hostnames. This grants those hosts access to Local Explorer APIs and other `/cdn-cgi/` endpoints. Setting Vite's `allowedHosts: true` keeps Miniflare's default protections enabled, even with the opt-in enabled.
