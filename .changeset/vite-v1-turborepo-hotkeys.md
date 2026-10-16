---
"@cloudflare/vite-plugin": patch
---

Hide unusable Wrangler development hotkeys under Turborepo stream output

The bundled Wrangler release hides shortcuts when Turborepo does not forward keyboard input, while retaining them in its interactive terminal UI. The compatible Wrangler dependency is supplied by the earlier remote-token retry backport; Vite's own shortcuts remain unchanged.
