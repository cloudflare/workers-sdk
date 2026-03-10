---
"@cloudflare/vite-plugin": patch
---

Warn when the `assets` field is provided for auxiliary Workers

Auxiliary Workers do not support static assets. Previously, the `assets` field was silently ignored but we now warn if it is used.
