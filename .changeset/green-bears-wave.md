---
"wrangler": patch
---

Make `name` the positional argument for `wrangler delete` instead of `script`

The `script` argument was meaningless for the delete command since it deletes by worker name, not by entry point path. The `name` argument is now accepted as a positional argument, allowing users to run `wrangler delete my-worker` instead of `wrangler delete --name my-worker`. The `script` argument is now hidden but still accepted for backwards compatibility.
