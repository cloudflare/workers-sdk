---
"miniflare": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-auth": patch
"@cloudflare/workers-utils": patch
"create-cloudflare": patch
"@cloudflare/vitest-plugin": patch
"wrangler": patch
---

Update Undici to 7.30.1 to prevent a malformed HTTP response from crashing development tools

The updated shared dependency rejects excessive content encodings without leaving an unhandled stream error when the server closes the connection early. This fixes GHSA-xjj6-f33q-929c and keeps the matching Undici types on the same version.
