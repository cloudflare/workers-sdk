---
"@cloudflare/vite-plugin": patch
---

Keep dependency optimization caches stable on the first Vite dev server restart.

Container cleanup state now survives config reloads without adding a plugin after the initial config is resolved. This also avoids unnecessary re-optimization for Workers that do not declare Containers.
