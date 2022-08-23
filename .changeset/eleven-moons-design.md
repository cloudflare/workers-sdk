---
"wrangler": patch
---

rename: `worker_namespaces` / `dispatch_namespaces`

The Worker-for-Platforms team would like to rename this field to more closely match what it's called internally. This fix does a search+replace on this term. This feature already had an experimental warning, and no one's using it at the moment, so we're not going to add a warning/backward compat for existing customers.
