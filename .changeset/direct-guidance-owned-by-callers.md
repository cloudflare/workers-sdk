---
"@cloudflare/containers-shared": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/vite-plugin": patch
---

Decouple shared deployment guidance from Wrangler

Shared deployment and Container helpers now receive only the command paths and configuration syntax required by each operation. Wrangler reuses the paths that register its command tree, while other consumers can supply their own values without global presentation state or Wrangler-specific fallbacks.
