---
"wrangler": patch
---

Polish Cloudflare Vite plugin installation during autoconfig

Projects using Vite 6.0.x were rejected by auto-configuration because the minimum supported version was set to 6.1.0 (the `@cloudflare/vite-plugin` peer dependency). The minimum version check is now 6.0.0, and when a project has Vite in the [6.0.0, 6.1.0) range, auto-configuration will automatically upgrade it to the latest 6.x before installing `@cloudflare/vite-plugin`.
