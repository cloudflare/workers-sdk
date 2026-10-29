---
"wrangler": patch
"@cloudflare/runtime-types": patch
---

Fix `wrangler types --check` reporting CRLF types files as out of date

When `worker-configuration.d.ts` was checked out with CRLF line endings (for example with Git's `core.autocrlf=true`, the default on Windows), the runtime header kept a trailing `\r` and never matched the expected header. `wrangler types --check` then always failed, `wrangler dev` always warned that the types might be out of date, and cached runtime types were never reused. Generated types files are now read with either line ending.
