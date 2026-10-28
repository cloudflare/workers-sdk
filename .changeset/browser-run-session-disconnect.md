---
"miniflare": patch
---

Clear a local Browser Run session's `connectionId` when its client disconnects

Sessions connected through `/v1/devtools/browser/:sessionId`, which current versions of `@cloudflare/puppeteer` and `@cloudflare/playwright` use, kept reporting a `connectionId` after the client closed its WebSocket. Reusing a session by picking one without a `connectionId` therefore never found a free session in local development.
