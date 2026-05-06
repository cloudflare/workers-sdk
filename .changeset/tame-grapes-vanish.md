---
"wrangler": patch
---

Fix `wrangler preview` not propagating the `assets` binding to preview deployments

Previously, `wrangler preview` would upload the asset manifest correctly but the resulting preview deployment had no `ASSETS` binding (or whatever name was configured under `assets.binding`). Workers reading from the binding would see `undefined` and fail at runtime.

The fix emits the assets binding into the deployment's `env` map alongside other bindings, mirroring `wrangler deploy`.
