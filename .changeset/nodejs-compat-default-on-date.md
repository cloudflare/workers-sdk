---
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/vite-plugin": minor
"miniflare": minor
"wrangler": minor
---

Detect Node.js compatibility from the compatibility date, now that `nodejs_compat` is enabled by default

As of compatibility date `2026-08-04`, workerd enables the `nodejs_compat` and `nodejs_compat_v2` compatibility flags by default. Previously these tools only treated Node.js compatibility as enabled when one of those flags was listed explicitly, so a Worker on a compatibility date of `2026-08-04` or later without the flag would get Node.js APIs from the runtime but no Node.js polyfills from the bundler, and `process.env` could be substituted with an empty object at build time. They now resolve these flags the same way workerd does, and honour `no_nodejs_compat` to opt out.

To keep Node.js compatibility switched off on a newer compatibility date, specify both `no_nodejs_compat` and `no_nodejs_compat_v2`, since each flag has its own default.

`@cloudflare/vitest-pool-workers` needs `nodejs_compat_v2` for its own test runner, so it continues to override a project that opts out of it. On a compatibility date that enables the flag anyway, it now drops the opt-out rather than adding the flag back, which workerd would reject — previously this stopped such a project from running any tests at all.

`wrangler types` also no longer attributes its `@types/node` suggestion to "the `nodejs_compat` flag", which it can now make for Workers that do not set the flag at all.
