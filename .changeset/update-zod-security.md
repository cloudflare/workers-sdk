---
"@cloudflare/config": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/format-errors": patch
"@cloudflare/playground-preview-worker": patch
"@cloudflare/turbo-r2-archive": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-shared": patch
"@cloudflare/workers-utils": patch
"@cloudflare/workflows-shared": patch
"miniflare": patch
"wrangler": patch
---

Update Zod to 4.6.6 to address GHSA-mrhx-c7xc-m3w5

The updated shared dependency fixes excessive memory consumption when validating oversized collections. This updates both the published Zod dependencies and the copies bundled into development tools and Workers.
