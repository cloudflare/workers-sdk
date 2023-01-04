---
"wrangler": patch
---

BREAKING CHANGE: refactor unstable_dev to use an experimental object, instead of a second options object

Before, if you wanted to disable the experimental warning, you would run:

```js
worker = await unstable_dev(
	"src/index.js",
	{},
	{ disableExperimentalWarning: true }
);
```

After this change, you'll need to do this instead:

```js
worker = await unstable_dev("src/index.js", {
	experimental: { disableExperimentalWarning: true },
});
```
