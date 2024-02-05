---
"wrangler": patch
---

fix: intercept and stringify errors thrown by d1 execute in --json mode

Prior to this PR, if a query threw an error when run in `wrangler d1 execute ... --json`, wrangler would swallow the error.

This PR returns the error as JSON. For example, the invalid query `SELECT asdf;` now returns the following in JSON mode:

```json
{
	"error": {
		"text": "A request to the Cloudflare API (/accounts/xxxx/d1/database/xxxxxxx/query) failed.",
		"notes": [
			{
				"text": "no such column: asdf at offset 7 [code: 7500]"
			}
		],
		"kind": "error",
		"name": "APIError",
		"code": 7500
	}
}
```
