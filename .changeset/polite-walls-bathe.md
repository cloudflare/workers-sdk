---
"@cloudflare/vite-plugin": patch
---

add `inspectorPort` option to plugin config

add an `inspectorPort` option that allows developers to start a devTools inspector server
that allows them to debug their workers (defaulting to `9229`)
