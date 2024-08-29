---
"wrangler": patch
---

chore: fix version upload log order

Previously deploy prints:
upload timings
deploy timings
current version id

while version upload prints:
worker version id
upload timings

This change makes version upload more similar to deploy by printing
version id after upload, which also makes more sense, as version ID can
only be known after upload has finished.
