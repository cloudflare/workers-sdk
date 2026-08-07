---
"miniflare": major
---

Replace Miniflare's options API with Cloudflare config-based worker options

`new Miniflare()` and `setOptions()` now require a `workers` array of worker entries. Binding, service, tail, remote, asset, workflow, unsafe binding, and other worker configuration now follows the schemas in `packages/miniflare/src/config/schema.ts`.

The previous flat options shape is no longer accepted directly. Existing v4-shaped options can be migrated with `convertV4MiniflareOptions()`.
