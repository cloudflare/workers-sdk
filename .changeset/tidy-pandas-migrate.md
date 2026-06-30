---
"@cloudflare/vite-plugin": patch
---

Preserve D1 migration paths in generated Worker configs

When a Worker config with a D1 binding is built by the Vite plugin, the generated `wrangler.json` now points `migrations_dir` back to the source migration directory. This lets tools that read the generated config, such as `createTestHarness()`, find the same D1 migrations as the source Worker config.
