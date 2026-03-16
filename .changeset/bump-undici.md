---
"wrangler": patch
"miniflare": patch
---

fix: bump undici from 7.18.2 to 7.24.4 to resolve 6 high/moderate severity CVEs

`npm audit` reports 6 vulnerabilities in undici 7.0.0–7.23.0 (WebSocket overflow, HTTP smuggling, memory DoS, CRLF injection). All are fixed in >=7.24.0.
