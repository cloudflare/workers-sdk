---
"@cloudflare/autoconfig": minor
"wrangler": minor
---

Fix cf builds for static projects that serve assets from the project root

Autoconfig now recognizes relative root paths when adding safeguards for sensitive Wrangler files. The experimental Build Output path also omits its generated `.cloudflare/output` subtree while preserving the project's other root assets and `.assetsignore` semantics.
