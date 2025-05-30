---
"miniflare": minor
---

feat: add Dev Registry support

This change introduces two new options to support cross-process service bindings, durable objects and tail consumers via a file-system based registry, with backward compatibility to Wrangler’s implementation:

- **`unsafeDevRegistryPath`** (`string`): Filesystem path to the Dev Registry directory.
- **`unsafeDevRegistryDurableObjectProxy`** (`boolean`): When enabled, exposes internal Durable Objects to other local dev sessions and allows Workers to connect to external Durable Objects.

Example usage:

```ts
import { Miniflare } from "miniflare";

const mf = new Miniflare({
	scriptPath: "./dist/worker.js",
	unsafeDevRegistryPath: "/registry",
	unsafeDevRegistryDurableObjectProxy: true,
	// ...other options
});
```
