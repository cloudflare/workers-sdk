---
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/pages-shared": patch
"miniflare": patch
"wrangler": patch
---

chore: Normalize more deps

This is the last of the patches that normalize dependencies across the codebase. In this batch: `ws`, `vitest`, `zod` , `rimraf`, `@types/rimraf`, `ava`, `source-map`, `glob`, `cookie`, `@types/cookie`, `@microsoft/api-extractor`, `@types/mime`, `@types/yargs`, `devtools-protocol`, `@vitest/ui`, `execa`, `strip-ansi`

This patch also sorts dependencies in every `package.json`
