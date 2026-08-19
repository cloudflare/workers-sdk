---
"@cloudflare/config": patch
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Only resolve the `default` and `settings` exports of a `cloudflare.config.ts`

Loading a `cloudflare.config.ts` previously resolved and validated every export of the module, so adding an unrelated named export next to your config was a hard validation error. Worse, an exported _function_ was not merely rejected — it was invoked with the config context at config-load time, running side effects the author never intended.

`loadAndValidateConfig` now defaults to resolving only the `default` and `settings` exports; anything else is ignored, matching how `wrangler.config.ts` already behaves. This means you can keep shared constants and helpers alongside your config:

```ts
export const WORKER_NAME = "my-worker";

export default defineWorker({
	name: WORKER_NAME,
	entrypoint: "./src/index.ts",
	compatibilityDate: "2026-05-18",
});
```

The `settings` reserved-name validation is unchanged, and callers can still opt into resolving other exports by passing an explicit `include` list.
