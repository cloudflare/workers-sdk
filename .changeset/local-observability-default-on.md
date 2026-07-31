---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Enable local observability capture by default in dev

`wrangler dev` and the Vite plugin now capture request traces and console logs into the Local Explorer's Observability tab out of the box — previously this was opt-in behind `X_LOCAL_OBSERVABILITY=true`. Set `X_LOCAL_OBSERVABILITY=false` to opt out (for example if the extra per-worker collector/streaming-tail services cause trouble in a multi-process dev-registry setup).
