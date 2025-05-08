---
"@cloudflare/vite-plugin": minor
---

Support HTTPS and HTTP/2. Configuring [`server.https`](https://vite.dev/config/server-options#server-https) and/or [`preview.https`](https://vite.dev/config/preview-options#preview-https) in your Vite config now works as expected. This was previously broken because Undici would add a `transfer-encoding` header for streamed responses. We now remove this header if the request uses HTTP/2.
