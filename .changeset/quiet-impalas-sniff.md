---
"wrangler": minor
---

feat: Support `WRANGLER_CI_MATCH_TAG` environment variable.

When set, this will ensure that `wrangler deploy` and `wrangler versions upload` only deploy to Workers which match the provided tag.
