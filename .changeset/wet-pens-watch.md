---
"wrangler": patch
---

feat: implement remote mode for unstable_dev

With this change, `unstable_dev` can now perform end-to-end (e2e) tests against your workers as you dev.

Usage:

```js
await unstable_dev("src/index.ts", {
	local: false,
});
```
