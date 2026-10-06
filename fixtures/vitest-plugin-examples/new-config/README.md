# ✅ new-config

This Worker is configured with a `cloudflare.config.ts` file instead of a Wrangler configuration file, using the experimental `experimental.newConfig` pool option. Bindings, the compatibility date and the entrypoint all come from that file.

Config functions receive `ctx.mode` set to Vite's mode, which defaults to `"test"` under Vitest and can be overridden with `--mode`.

| Test                                | Overview                                                             |
| ----------------------------------- | -------------------------------------------------------------------- |
| [index.test.ts](test/index.test.ts) | Bindings, `SELF` dispatch and unit tests against a new-config Worker |
