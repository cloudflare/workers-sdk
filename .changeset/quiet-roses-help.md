---
"create-cloudflare": patch
---

Fix the fallback compatibility date being always incorrectly used when running the CLI via `pnpm`

Previously, `create-cloudflare` used `getLocalWorkerdCompatibilityDate` from `@cloudflare/workers-utils`, which attempted to get the compatibility date from `workerd` via `miniflare`. When running via `pnpm`, the resolution to `miniflare` would however fail and the fallback date was always used instead of the actual `workerd` compatibility date. The fix switches to using `supportedCompatibilityDate` from `wrangler` directly, which does not depend on the `miniflare` resolution and works reliably across all package managers.
