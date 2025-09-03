---
"@cloudflare/vite-plugin": patch
---

Set `preserveEntrySignatures: "strict"` for Worker environments. This ensures that no additional exports are added to the entry module.
