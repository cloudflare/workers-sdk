---
"@cloudflare/workflows-shared": patch
---

Fix `wrangler dev` Workflows crashing with `SQLITE_TOOBIG` when a step returns a large `Uint8Array`

`JSON.stringify` encodes each byte of a `Uint8Array` as a separate numeric key
(`{"0":1,"1":2,...}`), producing a string ~10× larger than the array's byte
length. A 200 KB `Uint8Array` became a ~2 MB JSON string that exceeded SQLite's
blob limit, crashing the Workflow step. The same bytes returned as an
`ArrayBuffer` succeeded because `JSON.stringify(ArrayBuffer)` → `{}`.

The step log metadata (used by the local Workflows explorer) now stores a
human-readable description for `TypedArray` and `ArrayBuffer` outputs
(`[Uint8Array(200000 bytes)]`) instead of attempting to JSON-serialise the raw
bytes. The actual step value is unaffected — it is preserved in Durable Object
key-value storage via structured clone for replay by subsequent steps.
