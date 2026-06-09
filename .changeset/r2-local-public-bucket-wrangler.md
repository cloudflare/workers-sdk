---
"wrangler": minor
---

Serve local R2 bucket objects publicly via the dev server

When running `wrangler dev` locally, objects in each local R2 binding are now reachable under `/cdn-cgi/mf/r2/<bucket-id>/<key>` on the existing dev server, simulating a public bucket. The `<bucket-id>` is the bucket's `bucket_name` when set, otherwise its `binding`. Bindings configured with `remote: true` are not exposed.
