---
"wrangler": minor
---

Add `wrangler artifacts` commands for managing Artifacts repos and repo tokens.

This adds CLI support for the Artifacts control-plane workflows that were previously only available through the API. You can now list and inspect namespaces, create, list, inspect, and delete repos, and issue repo-scoped tokens when you need to authenticate git access.

The new commands support both human-readable output and `--json` output so they fit existing Wrangler automation patterns.
