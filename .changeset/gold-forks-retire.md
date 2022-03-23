---
"wrangler": patch
---

fix: resolve non-js modules correctly in local mode

In https://github.com/cloudflare/wrangler2/pull/633, we missed passing a cwd to the process that runs the miniflare cli. This broke how miniflare resolves modules, and led back to the dreaded "path should be a `path.relative()`d string" error. The fix is to simply pass the cwd to the `spawn` call.

Test plan:

```
cd packages/wrangler
npm run build
cd ../workers-chat-demo
npx wrangler dev --local
```
