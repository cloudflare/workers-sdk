---
"@cloudflare/autoconfig": patch
---

Keep an existing `workers/app.ts` when setting up React Router

Setting up a React Router project that already has `workers/app.ts`, such as one that already runs on Workers, no longer overwrites it.
