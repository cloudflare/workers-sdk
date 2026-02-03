---
"@cloudflare/vite-plugin": patch
---

fix: use proxy shared secret in vite plugin so that the miniflare entry worker trusts vite's handler and sets the correct Host header
