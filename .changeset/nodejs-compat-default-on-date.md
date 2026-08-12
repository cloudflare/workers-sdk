---
"@cloudflare/vitest-pool-workers": patch
"@cloudflare/vite-plugin": minor
"miniflare": minor
"wrangler": minor
---

Detect Node.js compatibility from the compatibility date, now that `nodejs_compat` is enabled by default

As of compatibility date `2026-08-04`, workerd enables the `nodejs_compat` and `nodejs_compat_v2` compatibility flags by default. Previously these tools only treated Node.js compatibility as enabled when one of those flags was listed explicitly, so a Worker on a compatibility date of `2026-08-04` or later without the flag would get Node.js APIs from the runtime but no Node.js polyfills from the bundler, and `process.env` could be substituted with an empty object at build time. They now resolve these flags the same way workerd does, and honour `no_nodejs_compat` to opt out.

#### If you hit "does not need to be specified anymore"

workerd rejects a compatibility flag that its compatibility date already enables, so a Worker that sets both a compatibility date of `2026-08-04` or later **and** `nodejs_compat` now fails to start or deploy with:

```
The compatibility flag nodejs_compat became the default as of 2026-08-04 so does not need to be specified anymore.
```

This is expected: bumping a compatibility date is how you opt in to behaviour changes. To fix it, remove the flag — Node.js compatibility remains enabled via the compatibility date:

```jsonc
// wrangler.json
{
	"compatibility_date": "2026-08-04",
	// "compatibility_flags": ["nodejs_compat"] <-- remove this
}
```

Note that if you do not set a `compatibility_date` at all, Wrangler, the Vite plugin and the Vitest pool infer today's date on your behalf, so you can hit this without having changed your own configuration. Either remove the flag as above, or set an explicit `compatibility_date` earlier than `2026-08-04`.

To keep Node.js compatibility switched off on a newer compatibility date, specify both `no_nodejs_compat` and `no_nodejs_compat_v2`, since each flag has its own default.

`@cloudflare/vitest-pool-workers` needs `nodejs_compat_v2` for its own test runner, so it continues to override a project that opts out of it. On a compatibility date that enables the flag anyway, it now drops the opt-out rather than adding the flag back, which workerd would reject — previously this stopped such a project from running any tests at all.

`wrangler types` also no longer attributes its `@types/node` suggestion to "the `nodejs_compat` flag", which it can now make for Workers that do not set the flag at all.
