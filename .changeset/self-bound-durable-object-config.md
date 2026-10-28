---
"@cloudflare/vitest-plugin": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/workers-utils": patch
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Fix Durable Object self-references in tests and container validation

Durable Object bindings that explicitly name the Worker itself now resolve to the test runner in `@cloudflare/vitest-plugin`, for both `cloudflare.config.ts` and Wrangler configuration files. Container validation also accepts these self-references, using the effective deployment name to distinguish local and external bindings.

Explicit binding targets remain intact during configuration conversion, so deploying with `--name` or a CI name override preserves the intended Durable Object target.
