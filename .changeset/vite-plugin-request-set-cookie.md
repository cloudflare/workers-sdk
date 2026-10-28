---
"@cloudflare/vite-plugin": patch
---

Preserve separate `Set-Cookie` request headers in Vite dev and preview

Workers now receive each incoming `Set-Cookie` value separately for HTTP requests and WebSocket upgrades, including values with commas in an `Expires` date. Previously, multiple values could be combined into one header.
