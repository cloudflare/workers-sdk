---
"@cloudflare/workers-utils": patch
"miniflare": patch
"wrangler": patch
---

Reduce the installed bundle sizes of Wrangler and Miniflare

Wrangler now resolves bundled workspace dependencies from source during monorepo builds so unused exports can be removed. Miniflare, its shared CLI and container dependencies now use granular `@cloudflare/workers-utils` entry points instead of loading the package barrel, reducing the raw Wrangler and Miniflare artifacts by 6.16 MiB (31.4%) and 1.06 MiB (22.9%) respectively without changing runtime behavior or installed dependencies.
