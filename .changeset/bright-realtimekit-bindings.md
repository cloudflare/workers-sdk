---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/codemods": minor
"miniflare": minor
"wrangler": minor
"@cloudflare/vite-plugin": minor
"@cloudflare/vitest-plugin": minor
---

Add RealtimeKit app bindings across Workers development tools

Configure an existing app using `realtimekit: [{ binding: "RTK", app_id: "<app-id>", remote: true }]` in `wrangler.json`. The experimental native configuration supports `bindings.realtimekit({ id: "<app-id>", dev: { remote: true } })`.

RealtimeKit bindings use the real app during local development and Worker tests; there is no local simulator. Miniflare, Wrangler, the Vite plugin, and the Vitest plugin share the existing remote RPC transport. Deployment metadata, configuration readback, configuration migration, and generated environment types also recognize the binding.
