---
"@cloudflare/vite-plugin": patch
---

Retry remote preview token refreshes after transient failures

Backport the retry fix to the private remote-bindings workspace package and require `wrangler@4.151.1` so long-running remote development sessions recover after a network outage.
