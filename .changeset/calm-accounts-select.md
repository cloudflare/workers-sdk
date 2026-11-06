---
"@cloudflare/workers-auth": minor
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Stop persisting account selections made by `cf` and the Cloudflare Vite and Vitest plugins

Profiles continue to select credentials rather than accounts. If the active credentials can access one account, it is selected automatically. If they can access multiple accounts, `cf` and the Vite and Vitest plugins reuse the selection while running but ask again the next time they start. Configure `accountId` in `cloudflare.config.ts` or set the `CLOUDFLARE_ACCOUNT_ID` environment variable to avoid repeated prompts.

Wrangler's existing persistent account selection remains unchanged.
