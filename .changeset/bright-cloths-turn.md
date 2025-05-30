---
"@cloudflare/vite-plugin": minor
---

Enable cross-process Service bindings and Tail workers with the Dev Registry

You can now run workers in separate dev sessions—whether `vite dev` or `wrangler dev`—and they’ll automatically discover and connect to each other:

**Worker A**

```jsonc
// ./worker-a/wrangler.jsonc
{
	"name": "worker-a",
	"main": "./src/index.ts",
	"services": [
		{
			"binding": "SERVICE",
			"service": "worker-b",
		},
	],
}
```

**Worker B**

```jsonc
// ./worker-b/wrangler.jsonc
{
	"name": "worker-b",
	"main": "./src/index.ts",
	"tail_consumers": [
		{
			"service": "worker-a",
		},
	],
}
```

Then run both workers in separate terminals:

```sh
# Terminal 1
cd worker-a
vite dev

# Terminal 2
cd worker-b
vite dev
# or `wrangler dev` if you prefer
```

That's it!
