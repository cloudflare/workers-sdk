---
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/vite-plugin": patch
"miniflare": patch
"wrangler": patch
---

Ignore a `nodejs_compat` compatibility flag that the compatibility date already enables

workerd rejects a compatibility flag that its compatibility date enables by default, so a Worker configured with both a compatibility date of `2026-08-04` or later **and** `nodejs_compat` failed to start locally with "The compatibility flag nodejs_compat became the default as of 2026-08-04 so does not need to be specified anymore".

The redundant `nodejs_compat` and `nodejs_compat_v2` flags are now dropped when starting the runtime, which has no effect on the resulting Worker because the compatibility date enables both anyway. `no_nodejs_compat` and `no_nodejs_compat_v2` still switch Node.js compatibility off, and a flag specified alongside its own opt-out is left alone so that workerd still reports those as contradictory.
