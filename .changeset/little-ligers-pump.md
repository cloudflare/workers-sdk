---
"playground-preview-worker": patch
"@cloudflare/vitest-pool-workers": patch
"workers-playground": patch
"create-cloudflare": patch
"@cloudflare/kv-asset-handler": patch
"@cloudflare/pages-shared": patch
"@cloudflare/quick-edit": patch
"miniflare": patch
"wrangler": patch
---

Normalize some dependencies in workers-sdk

This is the first of a few expected patches that normalize dependency versions, This normalizes `undici`, `concurrently`, `@types/node`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `eslint`, `typescript`. There are no functional code changes (but there are a couple of typecheck fixes).
