---
"@cloudflare/vite-plugin": minor
"wrangler": minor
---

Evaluate Flagship flags locally during development

Flagship bindings now use the local Miniflare store by default in Wrangler and the Vite plugin, keeping development offline and isolated from production flags. Set `remote: true` on a binding to continue using its remote app.

Use `wrangler flagship flags pull <APP_ID>` to seed the store from a remote app. Flag management commands also accept `--local` to read and update the local store directly.
