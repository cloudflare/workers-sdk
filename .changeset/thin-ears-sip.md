---
"wrangler": patch
---

Fix `.gitignore` formatting when autoconfig creates a new file

Previously, when `wrangler setup` or `wrangler deploy` created a new `.gitignore` file via autoconfig, it would add unnecessary leading empty lines before the wrangler-specific entries. Empty separator lines should only be added when appending to an existing `.gitignore` file. This fix ensures newly created `.gitignore` files start cleanly without leading blank lines.
