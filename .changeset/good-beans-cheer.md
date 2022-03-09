---
"wrangler": patch
---

fix: resolve modules correctly in `wrangler dev --local`

This is an alternate fix to https://github.com/cloudflare/miniflare/pull/205, and fixes the error where miniflare would get confused resolving relative modules on macs because of `/var`/`/private/var` being symlinks. Instead, we `realpathSync` the bundle path before passing it on to miniflare, and that appears to fix the problem.

Test plan:

```
cd packages/wrangler
npm run build
cd ../workers-chat-demo
npx wrangler dev --local
```

Fixes https://github.com/cloudflare/wrangler2/issues/443
