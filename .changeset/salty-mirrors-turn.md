---
"wrangler": minor
---

Support `--tag` and `--message` flags on `wrangler deploy`

They have the same behavior that they do as during `wrangler versions upload`, as both
are set on the version.

The message is also reused for the deployment as well, with the same behavior as used
during `wrangler versions deploy`.
