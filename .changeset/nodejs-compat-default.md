---
"create-cloudflare": minor
---

Enable `nodejs_compat` by default for new projects

New projects created with C3 will now have the `nodejs_compat` compatibility flag automatically enabled. This makes it easier to get started with Workers, as many npm packages require Node.js compatibility to work correctly.

If you don't want `nodejs_compat` enabled, you can remove it from your `wrangler.json` or `wrangler.toml` configuration file:

```json
{
	"compatibility_flags": []
}
```
