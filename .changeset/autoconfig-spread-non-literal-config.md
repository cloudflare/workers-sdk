---
"@cloudflare/autoconfig": patch
"wrangler": patch
---

Keep existing framework settings when autoconfig merges into a value set from a variable or a function call

Autoconfig used to replace such a value, dropping its settings. It now spreads it instead, so `vite: viteConfig` becomes `vite: { ...viteConfig, plugins: [...(viteConfig?.plugins ?? []), cloudflare()] }`.
