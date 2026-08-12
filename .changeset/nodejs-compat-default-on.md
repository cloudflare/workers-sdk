---
"miniflare": minor
"wrangler": minor
---

Enable Node.js compatibility by default for compatibility dates of 2026-08-04 or later

Workers with a compatibility date of `2026-08-04` or later now have Node.js compatibility enabled automatically. Previously the `nodejs_compat` flag had to be set explicitly.

Set the `no_nodejs_compat` compatibility flag to opt out.

```jsonc
// wrangler.json
{
	"compatibility_date": "2026-08-04",
	"compatibility_flags": ["no_nodejs_compat"]
}
```
