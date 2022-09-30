---
"wrangler": patch
---

feat: implement remote mode for unstable_dev

With this change, `unstable_dev` can now perform end-to-end (e2e) tests against your workers as you dev.

Note that to use this feature in CI, you'll need to configure `CLOUDFLARE_API_TOKEN` as an environment variable in your CI, and potentially add `CLOUDFLARE_ACCOUNT_ID` as an environment variable in your CI, or `account_id` in your `wrangler.toml`.

Usage:

```js
await unstable_dev("src/index.ts", {
	local: false,
});
```
