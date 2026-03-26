---
"@cloudflare/vitest-pool-workers": minor
---

Add configurable `logLevel` option to control `[vpw:*]` pool log verbosity

The pool logger was previously hardcoded to `VERBOSE`, causing debug messages like `[vpw:debug] Adding compatibility flag...` to always appear with no way to suppress them. A new `logLevel` option lets you control this:

```ts
import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
	plugins: [
		cloudflareTest({
			logLevel: "warn", // "none" | "error" | "warn" | "info" | "debug" | "verbose"
		}),
	],
});
```

The default is now `"info"`, which hides debug/verbose messages while still showing informational, warning, and error output.
