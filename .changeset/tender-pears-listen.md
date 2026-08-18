---
"wrangler": patch
"create-cloudflare": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-pool-workers": patch
---

Use a fixed default compatibility date rather than the current date

When no compatibility date was set, Wrangler, C3 and the Vitest pool all defaulted to the current date. `workerd` only accepts a compatibility date up to 7 days beyond its own release, so whenever a `workerd` release was delayed the default could get ahead of the runtime that had been installed, and local development would fail to start.

The default is now fixed at the release date of the `workerd` version that ships with each release, which leaves a week of headroom and updates as `workerd` is upgraded. `@cloudflare/vite-plugin` previously inlined the date at which it was built. It now shares the same default.
