---
"@cloudflare/workers-utils": major
---

Remove the `getLocalWorkerdCompatibilityDate` utility from the package

This utility has been removed because its implementation relied on retrieving the compat date from `workerd` by resolving to the `miniflare` dependency, which was unreliable in certain environments (e.g. when using `pnpm`). The functionality is now provided more reliably as a static export from `wrangler`.

Consumers should migrate to one of the following alternatives:
- `supportedCompatibilityDate` from `miniflare` — for direct miniflare users
- `supportedCompatibilityDate` re-exported from `wrangler` — for consumers of the wrangler programmatic API
