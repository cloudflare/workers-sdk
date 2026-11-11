---
"@cloudflare/config": minor
"miniflare": minor
"@cloudflare/codemods": patch
"@cloudflare/deploy-helpers": patch
"@cloudflare/vitest-plugin": patch
---

Move streaming tail consumers to `experimental.streamingTailConsumers` in `cloudflare.config.ts`

Streaming Tail Workers are now declared in a separate, experimental list instead of with `streaming: true` on a `tailConsumers` entry. `tailConsumers` now only lists Tail Workers with a `tail()` handler. This is a breaking change to the experimental config API: move each entry that set `streaming: true` to `experimental.streamingTailConsumers`, without the `streaming` field.

```ts
export default defineConfig({
	worker: {
		tailConsumers: [{ worker: "tail-worker" }],
		experimental: {
			streamingTailConsumers: [{ worker: "streaming-tail-worker" }],
		},
	},
});
```

Fields under `experimental` may change or be removed without a major version bump. The `wrangler-to-cf` codemod now converts `streaming_tail_consumers` to `experimental.streamingTailConsumers`.
