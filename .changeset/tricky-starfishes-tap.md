---
"wrangler": minor
---

We're soon going to make backend changes that mean that `wrangler dev --remote` sessions will no longer have an associated inspector connection. In advance of these backend changes, we've enabled a new `wrangler tail`-based logging strategy for `wrangler dev --remote`. For now, you can revert to the previous logging strategy with `wrangler dev --remote --no-x-tail-logs`, but in future it will not be possible to revert.

The impact of this will be that logs that were previously available via devtools will now be provided directly to the Wrangler console and it will no longer be possible to interact with the remote Worker via the devtools console.
