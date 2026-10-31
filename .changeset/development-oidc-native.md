---
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Connect local identity bindings through private wrapped service capabilities.

Support fresh `getToken()`, `getAuthorizationGrant(options)` and signed `fetch()` in Wrangler, Vite and explicitly opted-in Vitest runs. Keep human OAuth credentials in the host and cache only the eight-hour development session. Require current Worker edit access on every operation.
