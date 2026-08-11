---
"@cloudflare/workers-utils": patch
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Preserve complete dev-registry entries and stable shared-storage election order during updates

Dev-registry updates now use the same secure atomic file replacement helpers as credential storage and cloudflared downloads. Registration timestamps survive file replacement, with compatibility for older registry entries. Shared-storage startup uses process-owned locks that cannot expire while their owner is still running, while continuing to recover older startup lock files.
