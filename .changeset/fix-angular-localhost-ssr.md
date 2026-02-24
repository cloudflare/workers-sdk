---
"create-cloudflare": patch
"wrangler": patch
---

Fix Angular scaffolding to allow localhost SSR in development mode

Recent versions of Angular's `AngularAppEngine` block serving SSR on `localhost` by default. This caused `wrangler dev` / `wrangler pages dev` to fail with `URL with hostname "localhost" is not allowed.`

The fix passes `allowedHosts: ["localhost"]` to the `AngularAppEngine` constructor in `server.ts`, which is safe to do even in production since Cloudflare will already restrict which host is allowed.
