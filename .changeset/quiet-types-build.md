---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Generate types during development and supported builds with Vite's `experimental.newConfig` option or Wrangler's `--experimental-new-config` flag (and `--experimental-cf-build-output` for builds)

When Wrangler's `--experimental-new-config` flag or Vite's `experimental.newConfig` option is enabled, inferred configuration and runtime declarations are now kept in `.cloudflare/types/index.d.ts`. Vite refreshes them during development and production builds. Wrangler refreshes them during development and when building with both `--experimental-new-config` and `--experimental-cf-build-output`. In the experimental `wrangler.config.ts` format, the `types` option is now top-level because it applies to both commands.
