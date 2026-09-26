---
"@cloudflare/codemods": patch
---

Stop blocking Vite migrations on `upload_source_maps`

The `wrangler-to-cf` codemod previously treated `upload_source_maps: true` as unsupported Wrangler tooling when the Vite bundler was selected, which added a migration guard to `cloudflare.config.ts`. It now reports non-blocking guidance to enable `build.sourcemap` for the Worker's Vite environment, because `cf deploy` uploads source maps included in the build output. `upload_source_maps: false` no longer produces a follow-up.
