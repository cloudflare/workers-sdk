---
"miniflare": minor
"wrangler": minor
"@cloudflare/workers-utils": minor
"@cloudflare/remote-bindings": minor
---

Add a local Artifacts binding simulator backed by native Git for Worker development

Artifacts bindings now use local, persistent repositories by default in development. Set `remote: true` on the binding to opt into the remote resource. The simulator supports the binding RPC methods and authenticated Git smart HTTP without requiring Cloudflare credentials for local use.
