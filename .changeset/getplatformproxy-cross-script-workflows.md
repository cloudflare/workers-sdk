---
"wrangler": minor
---

`getPlatformProxy()` now passes through workflow bindings that have a `script_name`

Workflows without a `script_name` are still stripped (and warned about) because the engine for an internal workflow can't run inside the empty proxy worker that backs `getPlatformProxy()`. Workflows with a `script_name` are handed to miniflare unchanged; miniflare reroutes the engine's `USER_WORKFLOW` binding through the dev-registry-proxy when the target worker is running in another Miniflare instance — the same mechanism Durable Objects already use.

This means SvelteKit/Remix (and similar split-process setups) can call `platform.env.MY_WORKFLOW.create({ ... })` directly from their server-side request handlers in dev, as long as the workflow class is exposed by another worker registered in the dev registry.

Closes [#7459](https://github.com/cloudflare/workers-sdk/issues/7459).
