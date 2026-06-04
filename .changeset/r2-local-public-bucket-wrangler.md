---
"wrangler": minor
---

Add experimental `experimental_local_public` option to R2 bucket bindings for serving objects publicly in local dev

When running `wrangler dev` locally, you can now expose a local R2 bucket's objects under `/cdn-cgi/mf/r2/<bucket-id>/<key>` on the existing dev server, simulating a public bucket. Set `experimental_local_public: true` on an R2 binding to enable it:

```jsonc
// wrangler.json
{
	"r2_buckets": [
		{
			"binding": "MY_BUCKET",
			"bucket_name": "my-bucket",
			"experimental_local_public": true,
		},
	],
}
```
