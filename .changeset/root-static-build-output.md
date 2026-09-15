---
"wrangler": minor
---

Fix cf builds for static projects that serve assets from the project root

The experimental Build Output path now omits the reserved `.cloudflare` directory when the project root is used for static assets. Other root assets and `.assetsignore` semantics are preserved, while non-root asset directories retain their existing copy behaviour.
