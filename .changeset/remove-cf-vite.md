---
"@cloudflare/vite-plugin": minor
---

Remove the experimental internal `cf-vite` executable

Run development and builds through Vite's CLI or your framework's own commands instead. Configure `cloudflare({ remoteBindings: false })` to disable remote bindings; Preview builds continue to use `CLOUDFLARE_PREVIEW_BUILD`.
