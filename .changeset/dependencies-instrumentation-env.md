---
"@cloudflare/codemods": patch
---

Explain how to preserve dependency metadata opt-outs when migrating to cf

Wrangler configurations with `dependencies_instrumentation.enabled` set to `false` now receive a migration follow-up directing them to `CLOUDFLARE_DEPENDENCIES_INSTRUMENTATION=false`. Package exclusion lists remain required follow-up work because the environment variable controls dependency metadata as a whole.
