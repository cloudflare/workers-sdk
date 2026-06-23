---
"create-cloudflare": patch
---

Scaffold the Cloudflare-specific Waku files in the C3 script instead of relying on an external example

The Waku template now runs the default `create-waku` generator and overlays the Cloudflare-specific files (`wrangler.jsonc`, the Workers entrypoint `src/waku.server.tsx`, the Cloudflare `waku.config.ts`, and the `public/_headers` / `public/404.html` static assets) via `copyFiles`, installing the extra build
dependencies and removing the redundant trailing-slash dev middleware in `configure`. This removes the dependency on the external `wakujs/waku-examples` repository for the scaffolded project content.
