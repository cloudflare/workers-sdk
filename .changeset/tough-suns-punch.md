---
"wrangler": patch
---

chore: add `wrangler deployments view [deployment-id] --experimental-versions` command

This command will display an error message which points the user to run either `wrangler deployments status --experimental-versions` or `wrangler versions view <version-id> --experimental-versions` instead.
