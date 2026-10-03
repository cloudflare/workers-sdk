---
"wrangler": minor
---

Add `--namespace` and `--repo-name` to `wrangler queues subscription create` for the `artifacts.repo` source

The Event Subscriptions API requires `source.namespace` and `source.repo_name` for `artifacts.repo` subscriptions, but Wrangler had no way to pass them, so `--source artifacts.repo` always failed with a validation error. Both flags are now required for this source, and `wrangler queues subscription get` shows the subscription's resource as `<namespace>/<repo-name>`.
