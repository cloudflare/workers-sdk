---
"wrangler": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
---

Enable container egress interception in local dev without the `experimental` compatibility flag

Container local development now always prepares the egress interceptor sidecar image needed for `interceptOutboundHttp()`. This makes container-to-Worker interception available by default in Wrangler, Miniflare, and the Cloudflare Vite plugin.
