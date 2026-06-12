---
"wrangler": minor
---

Add experimental `experimental_local_s3_credentials` to `r2_buckets` config

When set, the R2 bucket is served over a local S3-compatible API at `/cdn-cgi/local/r2/s3/<bucket-name>` during local development, authenticated with the configured AWS SigV4 credentials:

```jsonc
{
	"r2_buckets": [
		{
			"binding": "BUCKET",
			"bucket_name": "my-bucket",
			"experimental_local_s3_credentials": {
				"accessKeyId": "local-access-key-id",
				"secretAccessKey": "local-secret-access-key",
			},
		},
	],
}
```
