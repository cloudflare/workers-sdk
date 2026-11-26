---
"@cloudflare/workers-auth": minor
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
"wrangler": patch
---

Prefer `CLOUDFLARE_ACCOUNT_ID` to the configured `accountId` in the Cloudflare Vite and Vitest plugins and in `cf dev`

When resolving an account for remote bindings, and for tunnels in the Vite plugin, the plugins and `cf dev` used the `accountId` in `cloudflare.config.ts` even when `CLOUDFLARE_ACCOUNT_ID` was set to a different account. This was the reverse of other `cf` commands, where the environment variable takes precedence. `CLOUDFLARE_ACCOUNT_ID` now takes precedence there too.

`wrangler` commands, and Vitest plugin projects that use a Wrangler configuration file, are unchanged: the configured `account_id` still takes precedence.
