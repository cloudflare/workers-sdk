---
"wrangler": patch
---

chore: error if d1 bindings used with `no-bundle`

While in beta, you cannot use D1 bindings without bundling your worker as these are added in through a facade which gets bypassed when using the `no-bundle` option.
