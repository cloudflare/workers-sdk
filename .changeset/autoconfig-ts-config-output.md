---
"@cloudflare/autoconfig": minor
---

Add experimental support for emitting the new programmatic config format

`runAutoConfig` accepts a new `experimentalConfigFormat` option (`"jsonc"` | `"ts"`, defaulting to `"jsonc"`). When set to `"ts"`, autoconfig writes the new programmatic config instead of `wrangler.jsonc`:

- a `cloudflare.config.ts` (runtime config via `defineWorker`), and
- for non-Vite projects, a `wrangler.config.ts` (tooling config via `defineWranglerConfig`) — Vite projects get a `cloudflare.config.ts` only.

Because the new format is driven by `cf`, this mode installs `cf` (rather than `wrangler`) and writes `cf deploy` / `cf dev` scripts.

A new `migrateWranglerConfigToNewFormat` export migrates an existing `wrangler.jsonc` project to the new format with full fidelity: it converts every supported field (bindings → `env`, routes/crons/queues → `triggers`, custom domains → `domains`, Durable Object migrations → `exports`, tooling fields → `wrangler.config.ts`), swaps the `wrangler` dependency and `package.json` scripts for `cf`, and removes the old `wrangler.jsonc`.
