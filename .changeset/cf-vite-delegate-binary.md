---
"@cloudflare/vite-plugin": patch
---

Add an experimental, internal `cf-vite` delegate binary

This adds an experimental `bin/cf-vite` binary that is spawned by Cloudflare's own parent tooling to drive the plugin as a long-running dev-server subprocess. It is not part of the plugin's public API surface, is not intended to be invoked directly, and its contract may change at any time without notice.
