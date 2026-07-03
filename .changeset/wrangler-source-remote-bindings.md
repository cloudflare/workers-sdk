---
"wrangler": patch
---

Source remote binding proxy sessions from the new `@cloudflare/remote-bindings` package. `startRemoteProxySession` now delegates to the package while preserving wrangler's own auth resolution (interactive `requireAuth` login and account selection) and error reporting.
