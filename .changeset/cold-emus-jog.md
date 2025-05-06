---
"@cloudflare/vite-plugin": minor
---

Support HTTPS and HTTP/2. Configuring `server.https` in your Vite config (https://vite.dev/config/server-options.html#server-https) now works as expected. This was previously broken because Undici would add a `transfer-encoding` header for streamed responses. We now remove this header if the request uses HTTP/2.
