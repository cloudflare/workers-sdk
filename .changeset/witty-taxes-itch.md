---
"@cloudflare/vite-plugin": patch
---

Skip shortcut registration in non-TTY environments

Previously, registering keyboard shortcuts in non-TTY environments (e.g., Turborepo) caused Miniflare `ERR_DISPOSED` errors during prerendering. Shortcuts are now only registered when running in an interactive terminal.
