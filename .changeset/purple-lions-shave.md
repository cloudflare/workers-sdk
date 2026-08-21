---
"@cloudflare/config": patch
"@cloudflare/vite-plugin": patch
"wrangler": patch
---

Deregister the `cloudflare.config.ts` Node module hooks once the config has loaded

The config loader installs `module.registerHooks()` hooks to resolve `with { type: "cf-worker" }` import attributes and track config dependencies. Those hooks are process-wide and were never removed, so after the first config load they stayed in Node's hook chain for the rest of the process and interfered with unrelated module loads in downstream tooling — most visibly breaking Vite/rolldown builds where the loader's `load` hook ended up in the chain for CSS and route modules.

Registrations are now reference counted and released as soon as the config's module graph has finished loading, so the hooks are only installed while a config is actually being imported. Nested and concurrent loads are safe, and watch mode re-registers on each reload.
