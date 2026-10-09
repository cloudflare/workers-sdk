---
"wrangler": minor
"@cloudflare/vite-plugin": minor
---

Add experimental `types` support to the cf development delegates

The `cf-wrangler` and `cf-vite` delegate binaries now generate `cloudflare.config.ts` types via their own installed runtime-types package. This lets a parent CLI generate types without pinning a separate copy of the runtime tooling, so generated types stay aligned with the project's development provider.
