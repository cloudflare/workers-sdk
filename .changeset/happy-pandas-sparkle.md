---
"wrangler": minor
---

expose new (no-op) `caches` field in `getBindingsProxy` result

add a new `caches` field to the `getBindingsProxy` result, such field implements a
no operation (no-op) implementation of the runtime `caches`

Note: Miniflare exposes a proper `caches` mock, we will want to use that one in
the future but issues regarding it must be ironed out first, so for the
time being a no-op will have to do
