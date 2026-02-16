---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Make config reading APIs async to support future code-based config files

`unstable_readConfig` now returns `Promise<Config>` instead of `Config`, and `experimental_readRawConfig` now returns a promise. If you rely on these experimental APIs, you'll need to update your usage. In the majority of cases, this will be as simple as adding an `await` keyword before the function call.

`unstable_getMiniflareWorkerOptions` is also now async as a consequence of `readConfig` becoming async.
