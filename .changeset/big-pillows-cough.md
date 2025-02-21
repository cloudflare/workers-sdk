---
"@cloudflare/vite-plugin": patch
---

Fix bug with usage of Cloudflare builtins in dependencies. These are now externalized during dependency optimization.
