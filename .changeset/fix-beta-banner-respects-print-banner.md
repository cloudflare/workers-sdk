---
"wrangler": patch
---

Fix beta/open-beta status message ignoring `printBanner: false` — when a command sets `printBanner: (args) => !args.json`, the status banner no longer appears in JSON output
