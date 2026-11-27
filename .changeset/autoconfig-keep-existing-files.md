---
"@cloudflare/autoconfig": patch
---

Keep a project's own Worker files when setting it up

React Router setup no longer writes `workers/app.ts` and `app/entry.server.tsx` or reinstalls `isbot` in a project that already has a Wrangler config. Setup for cf also keeps an existing `cloudflare.config.ts`.
