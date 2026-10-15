---
"@cloudflare/vite-plugin": major
---

Use native Cloudflare configuration and Build Output in Vite plugin v2

**Wrangler cannot deploy apps built with Vite plugin v2. Deploy with `cf deploy` instead.**

The plugin now loads Worker configuration from `cloudflare.config.ts` and no longer loads Wrangler configuration files. The `configPath` and `experimental.newConfig` options have been removed. Worker configuration supplied through the `config`, `auxiliaryWorkers`, and `prerenderWorker` plugin options now uses the native camelCase configuration format, and the exported `WorkerConfig` type has been updated to match.

Projects using a Wrangler configuration file must move their Worker configuration to `cloudflare.config.ts`.

Builds now always emit a structured Build Output in `.cloudflare/output`. When Containers are configured, `vite build` builds any Dockerfile-backed Container images and records them in the output. `vite preview` then reuses those images rather than rebuilding them when the preview server starts.

Wrangler is no longer a runtime or peer dependency of the plugin.
