---
"@cloudflare/vite-plugin": minor
---

Add Wrangler-compatible Worker customizers to the experimental Vite v2 plugin

Use `wranglerConfig` to reuse framework customizers for Worker entrypoints, compatibility settings, and Durable Object bindings with `cloudflare.config.ts`. Native-only configuration remains authoritative, unsupported legacy fields are rejected, and the existing native `config` option is unchanged.
