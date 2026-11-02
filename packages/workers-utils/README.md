# `@cloudflare/worker-utils`

> Internal utility package for workers-sdk. Not intended for external use — APIs may change without notice.

This package contains common utilities used across the dash, Wrangler, and other tooling.

Use the focused entry points for shared helpers without loading Miniflare or workerd:

```ts
import {
	getNodeCompat,
	type NodeJSCompatMode,
} from "@cloudflare/workers-utils/node-compat";
import { getFreshSourceMapSupport } from "@cloudflare/workers-utils/sourcemap";
```

The Node compatibility helper resolves the mode and explicit flags for a
compatibility date. The source-map helper loads an isolated source-map-support
instance so tools can install their own stack-trace handlers. Import these helpers
directly from workers-utils.
