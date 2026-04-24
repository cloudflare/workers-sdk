---
"wrangler": minor
---

Add `wrangler artifacts` commands for managing Artifacts namespaces, repos, and repo tokens.

This adds CLI support for the Artifacts control-plane workflows that were previously only available through the API. You can now create, list, inspect, and delete namespaces and repos directly from Wrangler, and issue repo-scoped tokens when you need to authenticate git access.

The new commands support both human-readable output and `--json` output so they fit existing Wrangler automation patterns.
