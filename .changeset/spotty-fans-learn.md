---
"@cloudflare/vite-plugin": patch
---

Use `rolldownOptions` in plugin config when available.

This improves compatibility with Vite 8 beta and removes warnings related to use of `esbuildOptions`.
