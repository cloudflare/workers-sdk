---
"@cloudflare/vite-plugin": patch
---

Fix typo that meant static routing exclude rules for static assets were being evaluated in both Vite and the Router Worker.
