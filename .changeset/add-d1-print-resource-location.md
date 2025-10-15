---
"wrangler": patch
---

fix: show local/remote status before D1 command confirmations

D1 commands (`execute`, `export`, `migrations apply`, `migrations list`) now display whether they're running against local or remote databases before showing confirmation prompts. This prevents confusion about which database will be affected by the operation.
