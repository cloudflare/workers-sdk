---
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": patch
"wrangler": minor
---

Add `images.url_transformations` to the Wrangler configuration

The `images` block now accepts a `url_transformations` object for controlling `/cdn-cgi/image/` transformations on requests served by a Worker. `enabled` is required, and `allowed_origins` optionally lists the origins images may be fetched from (use `["*"]` to allow any origin). `binding` is now optional, so `url_transformations` can be configured without an Images binding:

```jsonc
{
	"images": {
		"url_transformations": {
			"enabled": true,
			"allowed_origins": ["images.example.com"],
		},
	},
}
```

This change adds configuration and validation only. `url_transformations` is not supported in `previews`.
