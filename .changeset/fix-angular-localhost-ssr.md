---
"create-cloudflare": patch
"wrangler": patch
---

Fix Angular scaffolding to allow localhost SSR in development mode

Recent versions of Angular's `AngularAppEngine` block serving SSR on `localhost` by default. This caused `wrangler dev` / `wrangler pages dev` to fail with `URL with hostname "localhost" is not allowed.`

The fix passes `allowedHosts: ["localhost"]` to the `AngularAppEngine` constructor in `server.ts`, conditionally based on `process.env.NODE_ENV`. Wrangler statically replaces `process.env.NODE_ENV` with `"development"` during `wrangler dev` and `"production"` during `wrangler deploy`, so the localhost allowlist is only active during local development and is dead-code eliminated from production builds.
