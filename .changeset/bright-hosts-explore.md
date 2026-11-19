---
"miniflare": patch
"@cloudflare/vite-plugin": patch
---

Fix Local Explorer access through localhost subdomains and Vite's allowed hosts

Miniflare now trusts `*.localhost` for `/cdn-cgi/` requests. The Vite plugin also forwards resolved `server.allowedHosts` and `preview.allowedHosts` entries, including exact hostnames, suffix entries such as `.example.com`, and tunnel hostnames, to Miniflare's allowlist. Setting `allowedHosts: true` keeps Miniflare's default protections enabled.
