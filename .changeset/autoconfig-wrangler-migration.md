---
"@cloudflare/autoconfig": minor
"@cloudflare/codemods": minor
"@cloudflare/cli-shared-helpers": minor
---

Migrate Wrangler projects to cf through autoconfig

Pass a Wrangler config to `getDetailsForAutoConfig()` as `wranglerConfigPath`, and `runAutoConfig()` migrates it to `cloudflare.config.ts`, with new `bundler` and `requireCleanGitWorktree` options. `convertWranglerConfig` moves from `@cloudflare/codemods/wrangler-to-cf` to `@cloudflare/autoconfig/wrangler-to-cf`. The codemods `wrangler-to-cf` command, its `migrateWranglerToCf` export, and the `runCodemod()` options and result fields only it used are removed: use `cf migrate` instead. The Git worktree check moves to `@cloudflare/cli-shared-helpers/git`.
