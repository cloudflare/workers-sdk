---
"wrangler": minor
---

Enable using `ctx.exports` with containers

You can now use containers with Durable Objects that are accessed via [`ctx.exports`](https://developers.cloudflare.com/workers/runtime-apis/context/#exports).

Now your config file can look something like this:

```
{
	"name": "container-app",
	"main": "src/index.ts",
	"compatibility_date": "2025-12-01",
	"compatibility_flags": ["enable_ctx_exports"], // compat flag needed for now.
	"containers": [
		{
			"image": "./Dockerfile",
			"class_name": "MyDOClassname",
			"name": "my-container"
		},
	],
	"migrations": [
		{
			"tag": "v1",
			"new_sqlite_classes": ["MyDOClassname"],
		},
	],
	// no need to declare your durable object binding here
}
```

Note that when using `ctx.exports`, where you previously accessed a Durable Object via something like `env.DO`, you should now access with `ctx.exports.MyDOClassname`.

Refer to [the docs for more information on using `ctx.exports`](https://developers.cloudflare.com/workers/runtime-apis/context/#exports).
