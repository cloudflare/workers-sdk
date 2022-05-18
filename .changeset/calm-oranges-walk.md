---
"wrangler": patch
---

feat: add support for using wrangler behind a proxy

Configures the undici library (the library wrangler uses for `fetch`) to send all requests via a proxy selected from the first non-empty environment variable from "https_proxy", "HTTPS_PROXY", "http_proxy" and "HTTP_PROXY".
