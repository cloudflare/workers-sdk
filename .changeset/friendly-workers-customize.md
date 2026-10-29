---
"@cloudflare/vite-plugin": minor
---

Customize the full parsed Cloudflare configuration through the beta Vite plugin's `config` callback

The `config` option now accepts `(loadedConfig: ParsedInputConfigWithWorker) => ParsedInputConfigWithWorker`, allowing frameworks to customize account settings and Containers alongside the entry Worker. Both the loaded and returned configurations include a Worker, and `ParsedInputConfigWithWorker` is exported for framework authors. The returned configuration is revalidated, including resource relationships, before being used for development and recorded in the build output for preview and deployment.

This is a breaking change to the beta API: object overrides and callbacks that mutate or return partial Worker configurations must return a complete configuration instead. Copy the loaded configuration and any nested fields to preserve, for example `config: (loadedConfig) => ({ ...loadedConfig, worker: { ...loadedConfig.worker, name: "my-worker", compatibilityDate: "2026-10-01" } })`. Fields and arrays are replaced rather than deep-merged.
