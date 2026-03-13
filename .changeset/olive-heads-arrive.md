---
"wrangler": patch
---

Fix unclear error when assets upload session returns a `null` response

When deploying assets, if the Cloudflare API returns a `null` response object, Wrangler now provides a clear error message asking users to retry instead of failing with a confusing error.
