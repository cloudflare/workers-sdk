---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
"miniflare": patch
"@cloudflare/codemods": minor
---

Use automatic DPoP for managed identity OAuth

Remove public DPoP policy settings. Always request DPoP and accept either DPoP or Bearer from the original exchange; preserve policy-free configuration through schemas, conversion, upload and local stubs.
