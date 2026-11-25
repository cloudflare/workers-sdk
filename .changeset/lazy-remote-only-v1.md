---
"@cloudflare/vite-plugin": patch
---

Defer remote-only binding login until the first binding call

Local routes remain available while AI, Vectorize, or K2 authentication is pending or fails. Explicitly remote resources with local simulators still connect at startup.
