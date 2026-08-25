---
"@cloudflare/vitest-plugin": minor
---

Add an experimental `newConfig` option for loading the Worker's configuration from `cloudflare.config.ts`

Projects that have migrated to the new TypeScript configuration format had no way to run their Vitest suite against their real bindings, since there was no Wrangler configuration file left to point `wrangler.configPath` at. This adds the missing option, modelled on `@cloudflare/vite-plugin`'s `experimental.newConfig`:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject } from "vitest/config";

export default defineProject({
	plugins: [cloudflareTest({ experimental: { newConfig: true } })],
});
```

`newConfig: true` loads `cloudflare.config.ts` from the project root; pass `{ configPath: "..." }` to load it from elsewhere. Config functions are called with `ctx.mode` set to Vite's mode, which defaults to `"test"` and can be overridden with `--mode`. `experimental.newConfig` cannot be combined with `wrangler`.

This is experimental and may change without a major version bump. Wrangler environments, `wrangler.config.ts` tooling configuration, and type generation are not supported yet.
