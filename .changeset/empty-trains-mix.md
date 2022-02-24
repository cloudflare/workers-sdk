---
"wrangler": patch
---

fix: websockets

This fixes websockets in `wrangler dev`. It looks like we broke it in https://github.com/cloudflare/wrangler2/pull/503. I've reverted the specific changes made to `proxy.ts`.

Test plan -

```
cd packages/wrangler
npm run build
cd ../workers-chat-demo
npx wrangler dev

```
