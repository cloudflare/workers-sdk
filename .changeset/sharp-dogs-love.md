---
"@cloudflare/vite-plugin": patch
---

add validation for `configPath`s

add some validation for the `configPath`s specified in the plugin's options,
such validation returns helpful error messages that should clearly indicate
the issue to users
