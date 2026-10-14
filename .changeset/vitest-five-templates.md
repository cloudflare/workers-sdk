---
"create-cloudflare": patch
"@cloudflare/workers-auth": patch
"@cloudflare/workers-utils": patch
---

Use Vitest 5 in newly generated Workers projects and support Vitest 5 in shared test helpers

Workers templates now install Vitest 5 and disable its host filesystem module cache, which workerd cannot read. The optional Vitest peer ranges in workers-auth and workers-utils accept both Vitest 4 and 5.
