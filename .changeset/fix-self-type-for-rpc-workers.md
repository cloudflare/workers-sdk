---
"@cloudflare/vitest-pool-workers": patch
---

Add `ProvidedWorker` interface to allow typing `SELF` for RPC workers

The `SELF` export in `cloudflare:test` was previously typed as `Fetcher`, which prevented TypeScript from recognizing RPC methods when testing workers that extend `WorkerEntrypoint`.

You can now configure the type of `SELF` via module augmentation:

```ts
import type MyWorker from "./src/index";

declare module "cloudflare:test" {
	interface ProvidedWorker {
		default: typeof MyWorker;
	}
}

// Now SELF will have your RPC methods typed:
const result = await SELF.myRpcMethod("test");
```

When `ProvidedWorker.default` is not set, `SELF` defaults to `Fetcher` for backward compatibility.
