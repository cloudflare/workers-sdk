---
"create-cloudflare": patch
---

Avoid resorting to the fallback compatibility date when running via `pnpm`

Previously, when running `create-cloudflare` via `pnpm` the resolution of the local `miniflare` package failed and the fallback date was always used instead of the actual `workerd` compatibility date.

The fix switches to using `supportedCompatibilityDate` from `wrangler` directly, which does not depend on the `miniflare` resolution and works reliably across all package managers.
