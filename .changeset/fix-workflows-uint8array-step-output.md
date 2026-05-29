---
"miniflare": patch
"wrangler": patch
---

Fix `Uint8Array` step outputs in local Workflows being persisted with the full backing `ArrayBuffer`

A `Uint8Array` returned from a Workflows step under `wrangler dev` was serialised together with its full underlying `ArrayBuffer`, causing a raw `SQLITE_TOOBIG` error at view sizes well below the documented 1MiB step-output limit. For example, a 200KB view sliced from an 800KB buffer (a common pattern from `crypto.getRandomValues` or `arr.slice(...)` on a larger pool) would fail. The view's bytes are now copied to a tight buffer before persistence, bringing local behaviour in line with production. Fixes #14101.
