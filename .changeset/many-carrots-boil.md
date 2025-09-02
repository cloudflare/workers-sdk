---
"wrangler": patch
---

update `unstable_convertConfigBindingsToStartWorkerBindings` to prioritize preview config values

Ensure that if some bindings include preview values (e.g. `preview_database_id` for D1 bindings) those get used instead of the standard ones (since these are the ones that start worker should be using)
