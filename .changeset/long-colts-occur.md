---
"@cloudflare/vite-plugin": patch
---

Use `supportedCompatibilityDate` value from `miniflare` instead of getting the date from `@cloudflare/workers-utils`

`miniflare` exports the latest compatibility date `supportedCompatibilityDate` as, and that is the value that now the package uses as the latest supported workerd compatibility date. This doesn't have any specific user-facing effect (besides potentially making the function more reliable).
