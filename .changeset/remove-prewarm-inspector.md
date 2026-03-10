---
"@cloudflare/edge-preview-authenticated-proxy": minor
"@cloudflare/playground-preview-worker": minor
"@cloudflare/workers-playground": minor
---

Remove prewarm, inspector_websocket, and exchange proxy from preview flow

The preview session exchange endpoint (`/exchange`) has been removed from the edge-preview-authenticated-proxy — it has been unused since the dash started fetching the exchange URL directly (DEVX-979). The `prewarm` parameter is no longer required or accepted by the `.update-preview-token` endpoint.

The playground preview worker now treats `exchange_url` as optional, falling back to the initial token from the edge-preview API when exchange is unavailable. Inspector websocket proxying and prewarm have been removed in favour of using `tail_url` for live logs.
