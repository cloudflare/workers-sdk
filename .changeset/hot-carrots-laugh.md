---
"@cloudflare/workers-utils": patch
---

Update `getLocalWorkerdCompatibilityDate` to use the wrangler version if available

Update the `getLocalWorkerdCompatibilityDate` function to, at runtime, `require` wrangler and use its version of the `getLocalWorkerdCompatibilityDate` function if available.

This is a temporary solution, `getLocalWorkerdCompatibilityDate` should be removed from the package soon.
