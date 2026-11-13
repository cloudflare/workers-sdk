---
"@cloudflare/vite-plugin": minor
---

Use the local simulator for Artifacts bindings that omit `remote`

Artifacts now works locally without Cloudflare credentials by default. Set `remote: true` to use deployed repositories, or `remote: false` to silence the migration warning. The updated Miniflare runtime also supplies Browser Run quick actions and local Artifacts fixes.
