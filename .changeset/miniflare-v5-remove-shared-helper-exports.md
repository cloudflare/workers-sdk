---
"miniflare": minor
---

Remove deprecated shared tooling helper exports from Miniflare v5

#### Breaking changes

Miniflare v5 no longer exports `getNodeCompat`, `NodeJSCompatMode`, or `getFreshSourceMapSupport`. Add a dependency on `@cloudflare/workers-utils` and replace the Miniflare imports with:

```ts
import {
	getNodeCompat,
	type NodeJSCompatMode,
} from "@cloudflare/workers-utils/node-compat";
import { getFreshSourceMapSupport } from "@cloudflare/workers-utils/sourcemap";
```

These focused entry points support compatibility checks and isolated source-map handling without loading Miniflare or resolving the workerd binary. The helpers retain their behavior, and Miniflare continues to use the shared source-map helper internally.
