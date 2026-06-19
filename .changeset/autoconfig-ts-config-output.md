---
"@cloudflare/autoconfig": minor
---

Add experimental support for emitting the new programmatic config format for Vite projects

`runAutoConfig` accepts a new `experimentalConfigFormat` option (`"jsonc"` | `"ts"`, defaulting to `"jsonc"`). When set to `"ts"` and the project is Vite-based, autoconfig writes a `cloudflare.config.ts` (runtime config via `defineWorker`, imported from `@cloudflare/vite-plugin`) instead of `wrangler.jsonc`, and drives the project with `cf`. Tooling settings are owned by Vite, so they are surfaced as a warning rather than written to a config file. Any `wrangler.jsonc` a framework writes during setup is left untouched, since it may not be compatible with the new format.

Non-Vite projects (and the default `"jsonc"` format) continue to write `wrangler.jsonc`.

This is an experimental capability intended for internal use only.
