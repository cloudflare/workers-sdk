---
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-utils": patch
"miniflare": patch
"wrangler": patch
---

Standardize Zod validation error output

Format validation errors with Zod's built-in `prettifyError()` helper so Miniflare, Wrangler, the Vite plugin, and the Vitest plugin show consistent messages and property paths.
