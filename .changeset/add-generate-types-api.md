---
"wrangler": minor
---

Added the new `unstable_generateTypes` programmatic API for generating Worker types

You can now generate Worker types programmatically without using the CLI:

```typescript
import { writeFile } from "node:fs/promises";
import {
	unstable_formatGeneratedTypes,
	unstable_generateTypes,
} from "wrangler";

const {
	env, // Contains the environment/binding types
	runtime, // Contains the runtime types (or null if disabled)
} = await unstable_generateTypes({
	configPath: "./wrangler.jsonc",
});

const output = unstable_formatGeneratedTypes({ env, runtime });
//      ^? string
await writeFile("worker-configuration.d.ts", output);
```

This API is equivalent to running `wrangler types` from the command line. The `wrangler types` command now uses this API internally.
