---
"create-cloudflare": patch
"@cloudflare/deploy-helpers": patch
"miniflare": patch
"@cloudflare/pages-functions": patch
"@cloudflare/pages-shared": patch
"@cloudflare/quick-edit": patch
"@cloudflare/vitest-plugin": patch
"@cloudflare/workers-shared": patch
"@cloudflare/workflows-shared": patch
"wrangler": patch
---

Update esbuild to 0.28.2

Align esbuild dependency with tooling using the latest 0.28 patch so package managers can share one installation instead of downloading a second native binary.
