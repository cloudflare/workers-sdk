---
"@cloudflare/workers-utils": patch
---

Fix `getLocalWorkerdCompatibilityDate()` to resolve `miniflare` in workspaces even when `miniflare` hasn't been built yet.
