---
"@cloudflare/vite-plugin": major
---

Use native Cloudflare configuration and Build Output in Vite plugin v2

The plugin now loads Worker configuration from `cloudflare.config.ts` and no longer loads Wrangler configuration files. The `configPath` and `experimental.newConfig` options have been removed. Worker configuration supplied through the `config`, `auxiliaryWorkers`, and `prerenderWorker` plugin options now uses the native camelCase configuration format, and the exported `WorkerConfig` type has been updated to match.

Builds now always emit a structured build output in `.cloudflare/output`, which can be deployed with `cf deploy`. `vite preview` reads that output instead of generated Wrangler configuration and reuses its pre-built Container images rather than rebuilding Dockerfile-backed images.

Wrangler cannot deploy apps built with Vite plugin v2. Wrangler is also no longer a runtime or peer dependency of the plugin.
