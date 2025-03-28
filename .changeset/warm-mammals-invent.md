---
"@cloudflare/vite-plugin": patch
---

fix: make sure that the plugin keeps looking for available inspector ports by default

this change updates the plugin so that if an inspector port is not specified and the
default inspector port (9229) is not available it keeps looking for other available
port instead of crashing
