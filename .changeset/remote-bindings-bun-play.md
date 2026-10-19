---
"wrangler": patch
---

Fail fast when remote bindings cannot work under Bun

Under Bun, `getPlatformProxy()` with remote bindings, and other remote dev sessions, started normally, but every request to a remote binding then waited forever with no error. The local proxy learns where to forward those requests from a control message that Miniflare sends through an undici `dispatcher`, which Bun's `fetch()` ignores. Starting a remote proxy session now waits for that message to be delivered and, under Bun, throws an actionable `UserError` naming the cause instead of returning a session that hangs.
