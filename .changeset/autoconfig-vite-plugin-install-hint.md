---
"@cloudflare/autoconfig": patch
---

Suggest a compatible Cloudflare Vite plugin version when the installed one doesn't support cf

When `@cloudflare/vite-plugin` was missing or too old, autoconfig suggested installing `@cloudflare/vite-plugin@beta`, which resolves to a version that cf rejects. The suggested command now installs `@cloudflare/vite-plugin@^2.0.0-rc.0`, matching the version autoconfig installs when it configures a project for cf.
