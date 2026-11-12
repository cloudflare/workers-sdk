---
"@cloudflare/vite-plugin": patch
---

Normalize relative asset redirect pathnames without changing query values or fragments

Keep repeated separators captured by redirect placeholders within the site's path. Preserve explicitly configured external targets, including scheme-less URLs, when serving assets during development.
