---
"wrangler": patch
---

fix: include additional modules in `largest dependencies` warning

If your Worker fails to deploy because it's too large, Wrangler will display of list of your Worker's largest dependencies. Previously, this just included JavaScript dependencies. This change ensures additional module dependencies (e.g. WebAssembly, text blobs, etc.) are included when computing this list.
