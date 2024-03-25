---
"wrangler": minor
---

feature: Implement versioned rollbacks via `wrangler rollback [version-id] --experimental-versions`.

Please note, the `experimental-versions` flag is required to use the new behaviour. The original `wrangler rollback` command is unchanged if run without this flag.
