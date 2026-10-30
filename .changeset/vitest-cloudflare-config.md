---
"@cloudflare/vitest-plugin": minor
---

Promote `experimental.newConfig` to a stable `config` option

The experimental `experimental.newConfig` option is now the stable `config` option. Pass `config: true` to `cloudflareTest()` to load your Worker's bindings, entrypoint and compatibility settings from `cloudflare.config.ts` in the project root, or pass the path of a `cloudflare.config.ts` elsewhere:

```ts
cloudflareTest({ config: true });
cloudflareTest({ config: "./worker/cloudflare.config.ts" });
```

`config` can't be combined with `wrangler`. `miniflare` options are merged over the Worker from `cloudflare.config.ts`, with `miniflare` values taking precedence. Config functions receive Vitest's mode as `ctx.mode`, which defaults to `test` and can be changed with `--mode`.

If you used `experimental.newConfig`, secrets are now read from Vite's `envDir`.
