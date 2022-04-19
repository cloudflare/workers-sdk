---
"wrangler": patch
---

fix: don't log an error when `wrangler dev` is cancelled early

We currently log an `AbortError` with a stack if we exit `wrangler dev`'s startup process before it's done. This fix skips logging that error (since it's not an exception).

Test plan:

```
cd packages/wrangler
npm run build
cd ../../examples/workers-chat-demo
npx wrangler dev
# hit [x] as soon as the hotkey shortcut bar shows
```
