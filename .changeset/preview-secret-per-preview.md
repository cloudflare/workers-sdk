---
"wrangler": minor
---

Use Preview deployment PATCH APIs for Preview secret commands

Wrangler now updates Worker Preview secrets by patching the named Preview's latest deployment instead of patching the Worker's Previews settings. This keeps secret changes scoped to one Preview, avoids affecting production or other Previews, and creates a new Preview deployment that goes live at 100% immediately. `wrangler preview secret list` now reads from the named Preview's latest deployment and prints secret names with values masked. `wrangler preview secret bulk` now deletes a secret when its value is `null`, matching `wrangler secret bulk`.
