---
"@cloudflare/deploy-helpers": minor
"@cloudflare/workers-auth": minor
"@cloudflare/workers-utils": minor
"create-cloudflare": minor
"miniflare": patch
"wrangler": minor
---

Upgrade Undici to v8 and require Node.js 22.19.0 or later

The new Undici version stops reusing HTTP/1.1 sockets whose keep-alive timeout has elapsed, even when a busy event loop delays the timeout callback. This fixes intermittent connection resets in local development. Update older Node.js installations before upgrading these packages.
