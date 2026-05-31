---
"wrangler": patch
---

Update React Router autoconfig to use `cloudflare:workers` env pattern and enable v8 future flags

The upstream React Router templates added v8 future flags in [remix-run/react-router-templates#210](https://github.com/remix-run/react-router-templates/pull/210), including `v8_middleware` which changes the context API from `AppLoadContext` to `RouterContextProvider`. This broke the autoconfig-generated `workers/app.ts` which relied on the old `AppLoadContext` pattern.

The React Router autoconfig (`wrangler setup`) now generates a simpler `workers/app.ts` that no longer uses the `AppLoadContext` module augmentation pattern. Instead, Cloudflare Worker bindings are accessible via `import { env } from "cloudflare:workers"` in loaders and actions. This aligns with the [upstream Cloudflare template](https://github.com/remix-run/react-router-templates/tree/main/cloudflare) and is compatible with all v8 future flags.

Additionally, the autoconfig now enables all applicable v8 future flags in `react-router.config.ts` based on the installed React Router version:

- `v8_middleware`, `v8_splitRouteModules`, `v8_viteEnvironmentApi` (>= 7.10.0)
- `v8_passThroughRequests` (>= 7.15.0)
- `v8_trailingSlashAwareDataRequests` (>= 7.16.0)

This prepares new projects for the upcoming React Router v8 release.
