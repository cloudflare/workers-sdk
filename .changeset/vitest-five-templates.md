---
"create-cloudflare": patch
"@cloudflare/workers-auth": patch
"@cloudflare/workers-utils": patch
---

Use Vitest 5 in newly generated Workers projects and support Vitest 5 in shared test helpers

Workers templates now install Vitest 5 and require @cloudflare/vitest-plugin 1.4.3 or newer, which supports Vitest's filesystem module cache. The optional Vitest peer ranges in workers-auth and workers-utils accept both Vitest 4 and 5.
