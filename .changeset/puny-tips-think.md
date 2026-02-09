---
"wrangler": patch
---

Fix incorrect logic during autoconfiguration (when running `wrangler setup` or `wrangler deploy --x-autoconfig`) that caused parts of the project's `package.json` file, removed during the process, to incorrectly be added back
