---
"@cloudflare/runtime-types": patch
"wrangler": patch
---

Fix `wrangler types --check` reporting types out of date when `worker-configuration.d.ts` has CRLF line endings

Normalize line endings when comparing generated runtime and environment headers so that carriage return characters (`\r`) on Windows CRLF checkouts do not cause false-positive "types out of date" diffs in `wrangler types --check` or during `wrangler dev`. Also ensure `@cloudflare/runtime-types` recognizes cached types when existing files use CRLF line endings.
