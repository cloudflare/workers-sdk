---
"@cloudflare/autoconfig": patch
---

Require Vite 7 or later when autoconfiguring Vite projects for `cf`

`cf` installs `@cloudflare/vite-plugin` v2, which requires Vite 7 or 8, so a Vite 6 project is now rejected before any changes are made instead of failing during dependency installation.
