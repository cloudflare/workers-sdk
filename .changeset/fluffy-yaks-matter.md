---
"wrangler": patch
---

fix: switch default logging level of `unstable_dev()` to `warn`

When running `unstable_dev()` in its default "test mode", the logging level was set to `none`. This meant any Worker startup errors or helpful warnings wouldn't be shown. This change switches the default to `warn`. To restore the previous behaviour, include `logLevel: "none"` in your options object:

```js
const worker = await unstable_dev("path/to/script.js", {
	logLevel: "none",
});
```
