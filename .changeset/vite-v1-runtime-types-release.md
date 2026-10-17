---
"@cloudflare/vite-plugin": patch
---

Align experimental runtime type generation with the updated Miniflare release

Use `@cloudflare/runtime-types@0.1.12` for experimental programmatic configuration so its runtime type generator uses the same Miniflare patch as the plugin. Other compatible dependency versions from this SDK release are supplied by the earlier backports.
