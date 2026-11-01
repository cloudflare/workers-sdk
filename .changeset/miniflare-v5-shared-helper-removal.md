---
"miniflare": minor
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Remove shared tooling helper exports from Miniflare v5

This is a breaking change in Miniflare v5 beta. Miniflare no longer exports `getNodeCompat`, `NodeJSCompatMode`, or `getFreshSourceMapSupport`. Add a dependency on `@cloudflare/workers-utils` and replace the Miniflare imports with:

```ts
import {
	getNodeCompat,
	type NodeJSCompatMode,
} from "@cloudflare/workers-utils/node-compat";
import { getFreshSourceMapSupport } from "@cloudflare/workers-utils/sourcemap";
```

Wrangler and the Cloudflare Vite and Vitest plugins now use the shared helpers directly. The helpers retain their behavior and can be imported without loading the Workers runtime.
