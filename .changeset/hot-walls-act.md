---
"wrangler": patch
---

Fix `.assetsignore` formatting when autoconfig creates a new file

Previously, when `wrangler setup` or `wrangler deploy --x-autoconfig` created a new `.assetsignore` file via autoconfig, it would add unnecessary leading empty lines before the wrangler-specific entries. Empty separator lines should only be added when appending to an existing `.assetsignore` file. This fix ensures newly created `.assetsignore` files start cleanly without leading blank lines.
