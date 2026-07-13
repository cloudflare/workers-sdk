---
"wrangler": patch
"@cloudflare/vite-plugin": patch
---

fix: Respect auth profiles when using remote bindings in the Vite plugin

Auth profiles (configured via `wrangler auth create` and `wrangler auth activate`) were previously being ignored when using remote bindings with the Vite plugin. This is now fixed.

Note that the profile directory is resolved based on the [Vite project root](https://vite.dev/config/shared-options.html#root).
