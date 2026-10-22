---
"@cloudflare/vitest-plugin": minor
---

Support `cloudflare.config.ts` with the new `config` option

Pass `config: true` to `cloudflareTest()` to load your Worker's bindings, entrypoint and compatibility settings from `cloudflare.config.ts` in the project root. Pass the file's path instead to load it from somewhere else:

```ts
cloudflareTest({ config: true });
cloudflareTest({ config: "./worker/cloudflare.config.ts" });
```

`config` can't be combined with `wrangler`. Config functions receive Vitest's mode as `ctx.mode`, which defaults to `test` and can be changed with `--mode`. Secrets are read from `.dev.vars` or `.env` files in Vite's `envDir` (the project root by default), including mode-specific variants such as `.dev.vars.test`, and only fill bindings declared with `{ type: "secret" }`. Remote bindings use cf credentials: run `cf auth login`, or set `CLOUDFLARE_API_TOKEN` in your environment. To serve assets, set the directory with `miniflare.assets`; the config's assets binding and settings then apply.

The experimental `experimental.newConfig` option has been removed. Use `config` instead.
