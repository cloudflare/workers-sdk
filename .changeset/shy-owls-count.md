---
"wrangler": patch
---

fix: KV not setting correctly
The KV has URL inputs, which in the case of `/` would get collapsed and lost.
T:o handle special characters `encodeURIComponent` is implemented.

resolves #961
