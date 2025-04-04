---
"@cloudflare/vite-plugin": patch
---

fix: make sure users can change inspector port when running vite dev

currently when a user starts a dev server with `vite dev` the inspector
port that the Cloudflare plugin will use will always be the initial one,
even if the user sets a specific port in the plugin's options inside
the vite config file, the changes here make sure that such config updates
are instead actually reflected
