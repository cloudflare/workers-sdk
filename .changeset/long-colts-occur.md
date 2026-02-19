---
"@cloudflare/vite-plugin": patch
---

Use `getLocalWorkerdCompatibilityDate` from `miniflare` instead of `@cloudflare/workers-utils`

`miniflare` exports a more stable and robust version of the `getLocalWorkerdCompatibilityDate` utility, and that is the version that now the package uses. This doesn't have any specific user-facing effect (besides potentially making the function more reliable).
