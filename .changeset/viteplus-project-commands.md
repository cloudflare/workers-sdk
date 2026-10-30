---
"@cloudflare/autoconfig": patch
---

Run the project-local Vite+ executable for Vite+ projects

Use `vp dev` and `vp build` when Vite+ is declared. Its Vite alias does not expose a `vite` executable, so invoking `vite` can fail with pnpm or cause npm to fetch a separate Vite. Preserve framework-owned commands and custom scripts.
