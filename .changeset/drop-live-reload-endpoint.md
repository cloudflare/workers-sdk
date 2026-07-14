---
"miniflare": major
---

Drop `/cdn-cgi/mf/reload` live reload endpoint and `liveReload` option

The built-in live reload mechanism has been removed from Miniflare. This included a WebSocket endpoint at `/cdn-cgi/mf/reload`, the `liveReload` option, and the automatic injection of a live reload `<script>` tag into HTML responses. For context, Wrangler and the Vite plugin both implement their own independent live reload mechanisms.
