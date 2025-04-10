---
"@cloudflare/vite-plugin": patch
---

fix: make sure users can change inspector port when running vite dev

Ensure that the inspector port is updated if the user modifies it in the Vite config while the dev server is running.
