---
"@cloudflare/codemods": minor
---

Migrate Workflow bindings in `cf migrate`

The `wrangler-to-cf` codemod now converts `workflows` entries to `bindings.workflow(...)` instead of dropping them, and adds an `exports.workflow(...)` entry, with its settings, for each Workflow the Worker defines itself. It also writes `defaultRetention` in camelCase, which the new config requires. `cf migrate` is in beta.
