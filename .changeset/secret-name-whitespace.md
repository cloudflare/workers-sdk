---
"wrangler": patch
---

fix: reject secret names with leading or trailing whitespace

The Workers dashboard accepts secret names with accidental leading or trailing spaces, producing a binding that is silently inaccessible as `env.<name>`. `wrangler secret put` and `wrangler secret bulk` now reject such names with a clear error instead of deploying them.
