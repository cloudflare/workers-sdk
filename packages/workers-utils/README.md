# `@cloudflare/workers-utils`

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

## Wrangler configuration

Use `@cloudflare/workers-utils/config` in Node.js for configuration APIs:

```ts
import { readConfig, type Config } from "@cloudflare/workers-utils/config";

const config: Config = readConfig(
	{ config: "wrangler.jsonc", env: "staging" },
	{ logger: { info: console.info, warn: console.warn } }
);
```

The entry point groups configuration discovery and reading, configuration and
environment types, defaults, normalization and validation, diagnostics, editing and
formatting, and helpers for interpreting bindings, containers and configured exports.
See the [configuration guide](./src/config/README.md) for details.

Configuration exports previously available from `@cloudflare/workers-utils` remain
available as deprecated compatibility aliases. Migrate both value and type imports
by changing their module specifier to `@cloudflare/workers-utils/config`:

```diff
-import { Diagnostics, type Config } from "@cloudflare/workers-utils";
+import { Diagnostics, type Config } from "@cloudflare/workers-utils/config";
```

The aliases share the same runtime functions, constructors and objects, and the
same underlying types. This release removes no previously published exports;
removing the aliases would require a future breaking change. The new `readConfig`
API is available only from `/config`. General utilities such as logging, file
operations and the generic config cache keep their existing entry points. The
browser root export of `constructWranglerConfig` also remains available.

Asset directory validation and routing options are shared by development and
deployment through `getAssetsOptions()`, `validateAssetsOptions()` and
`resolveAssetOptions()` in `/config`. Pass a logger when resolving options so
warnings follow the caller's logging policy. The focused `/asset-hash` entry point
exports `createFileHasher()` to initialize a reusable hasher for asset uploads
and local Pages serving.
