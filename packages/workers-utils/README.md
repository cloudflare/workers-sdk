# `@cloudflare/workers-utils`

A set of useful utilities that are used in other packages in the repository.

This is an internal source-only package, which means we don't compile the source files and do not publish it to npm.

To use it just add a workspace dependency on this package and import the code directly in the dependent package...

## package.json

```jsonc
{
	// ...
	"devDependencies": {
		"@cloudflare/workers-utils": "workspace:*",
		// ...
	},
}
```

## index.ts

```ts
import { getGlobalWranglerCachePath } from "@cloudflare/workers-utils";
```
