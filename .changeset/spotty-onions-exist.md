---
"wrangler": patch
---

feat: `publish --no-build`

This adds a `--no-build` flag to `wrangler publish`. We've had a bunch of people asking to be able to upload a worker directly, without any modifications. While there are tradeoffs to this approach (any linked modules etc won't work), we understand that people who need this functionality are aware of it (and the usecases that have presented themselves all seem to match this).
