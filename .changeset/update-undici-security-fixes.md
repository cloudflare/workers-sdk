---
"miniflare": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-auth": patch
"@cloudflare/workers-utils": patch
"create-cloudflare": patch
"@cloudflare/vitest-plugin": patch
"wrangler": patch
---

Update Undici to 7.30.2 to include upstream security fixes

This patch includes six upstream security fixes covering caching, redirects, and Subresource Integrity verification. Update the shared Undici dependency and matching types together so affected packages ship the patched version.
