---
"@cloudflare/autoconfig": patch
---

Keep a project's own Worker files when setting it up

React Router setup no longer writes `workers/app.ts` and `app/entry.server.tsx` or reinstalls `isbot` when the project's Wrangler config already names a Worker entry, and uses that entry instead. Setup for cf also keeps an existing `cloudflare.config.ts`.
