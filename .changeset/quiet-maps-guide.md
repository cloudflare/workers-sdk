---
"@cloudflare/codemods": patch
---

Stop blocking Vite migrations on `upload_source_maps`

The `wrangler-to-cf` codemod previously treated any `upload_source_maps` setting as unsupported Wrangler tooling when the Vite bundler was selected, which added a migration guard to `cloudflare.config.ts`. It now reports non-blocking guidance instead, because `cf deploy` uploads any Worker source maps included in the build output. For `upload_source_maps: true`, the guidance says to enable `build.sourcemap` for the Worker's Vite environment. For `upload_source_maps: false`, it says to keep that setting disabled.
