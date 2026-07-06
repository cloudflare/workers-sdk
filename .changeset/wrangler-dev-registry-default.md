---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Default `dev.registry` in `unstable_startWorker()` like the CLI

The CLI resolves the dev registry to `WRANGLER_REGISTRY_PATH` or `<global config>/registry` and passes it unless `--disable-dev-registry`, but the programmatic path used the input value raw — leaving `dev.registry` unset silently disabled cross-session service discovery, so `startWorker` workers could not resolve (or be resolved by) other local dev sessions' `script_name` bindings. `startWorker` now applies the same default; pass `dev.registry: false` to opt out (mirroring `persist: false`). The CLI's `--disable-dev-registry` and the API test harness pass `false` explicitly.
