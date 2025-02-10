---
"@cloudflare/vite-plugin": patch
---

The deploy config file is now written in the `writeBundle` hook rather than `builder.buildApp`. This ensures that the file is still written if other plugins override `builder` in the Vite config.
