---
"wrangler": patch
"@cloudflare/workers-utils": patch
"@cloudflare/deploy-helpers": patch
---

Support `dev.plugin` on typed services bindings

Wrangler only honored `dev.plugin` on `unsafe.bindings` entries, so users authoring a service binding via `services[]` could not wire it to a local Miniflare plugin during `wrangler dev` — they had to fall back to `unsafe.bindings` and accept a "directly supported by wrangler" warning. Typed services bindings now accept the same `dev: { plugin, options? }` shape, route the binding through Miniflare's external-plugin pathway in `wrangler dev`, and strip the field at deploy time. Validation rejects malformed `dev` shapes.
