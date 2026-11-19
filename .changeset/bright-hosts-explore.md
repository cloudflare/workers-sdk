---
"miniflare": patch
---

Fix Local Explorer access through localhost subdomains

Miniflare now trusts `*.localhost` in Host and Origin checks for `/cdn-cgi/` requests. This allows Local Explorer to load through localhost subdomains without returning `403 Invalid Origin header` for its module scripts and API requests.
