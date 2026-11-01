---
"@cloudflare/vite-plugin": patch
---

Update the v1 local runtime to workerd 1.20261101.1

Upgrade Miniflare to 5.20261101.0-beta with matching Wrangler and shared SDK dependencies. Local development and preview use the November 1 runtime, and Workers without an explicit compatibility date default to 2026-11-01. Update Workers types to match the runtime.
