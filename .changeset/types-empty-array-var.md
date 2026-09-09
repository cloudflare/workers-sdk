---
"wrangler": patch
---

Fix `wrangler types --strict-vars=false` emitting invalid TypeScript for an empty array var

A var whose value was an empty array produced `()[]`, which is a syntax error. Because this lands in the generated `worker-configuration.d.ts`, it did not just break that one line — the whole file failed to parse, so no binding types resolved at all. An empty array now generates `unknown[]`.
