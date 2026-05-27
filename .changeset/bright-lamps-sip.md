---
"wrangler": patch
---

Detect configless Vite projects during automatic configuration

Wrangler now recognizes Vite from `package.json` when no more specific framework is detected, including before dependencies are installed. It also creates a minimal `vite.config` with the Cloudflare Vite plugin when the project does not already have one.
