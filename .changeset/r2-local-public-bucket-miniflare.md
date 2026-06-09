---
"miniflare": minor
---

Add support for serving R2 bucket objects publicly via the dev server

Each local R2 bucket is now exposed under `/cdn-cgi/mf/r2/<bucket-id>/<key>` on the existing user-facing dev server. The `<bucket-id>` is the bucket's `id` when set, otherwise its binding name. Buckets with a `remoteProxyConnectionString` are not exposed. The endpoint supports GET and HEAD, range requests, conditional headers, and forwards stored HTTP metadata.
