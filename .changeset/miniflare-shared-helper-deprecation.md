---
"miniflare": patch
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Deprecate shared tooling helper exports from Miniflare

Miniflare continues to export `getNodeCompat`, `NodeJSCompatMode`, and `getFreshSourceMapSupport` for compatibility. These exports are deprecated and now use the implementations in `@cloudflare/workers-utils`. Add a dependency on that package and replace the Miniflare imports with:

```ts
import {
	getNodeCompat,
	type NodeJSCompatMode,
} from "@cloudflare/workers-utils/node-compat";
import { getFreshSourceMapSupport } from "@cloudflare/workers-utils/sourcemap";
```

Wrangler and the Cloudflare Vite and Vitest plugins now use the shared helpers directly. The helpers retain their behavior and can be imported without loading the Workers runtime.

The deprecated Miniflare exports will be removed in a later release, allowing downstream tools such as cf to migrate and release independently first.
