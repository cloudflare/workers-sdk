---
"@cloudflare/config": minor
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Add a `settings` export to the experimental `cloudflare.config.ts` config

Account-level settings (`accountId`, `complianceRegion`) now live in a dedicated, named `settings` export authored via `defineSettings`, rather than on the Worker config. A `cloudflare.config.ts` can export at most one `settings` object; the Worker itself is the `default` export.

```jsonc
// cloudflare.config.ts
import { defineSettings, defineWorker } from "wrangler/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export const settings = defineSettings({
	accountId: "<your-account-id>",
});

export default defineWorker({
	name: "my-worker",
	entrypoint,
	compatibilityDate: "2026-05-18",
});
```

This is only used behind the experimental new-config path (`wrangler --experimental-new-config` and the `@cloudflare/vite-plugin` `experimental.newConfig` option).
