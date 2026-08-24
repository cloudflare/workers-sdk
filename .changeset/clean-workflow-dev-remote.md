---
"miniflare": patch
---

Remove unsupported remote configuration from Workflow bindings

Miniflare now rejects `dev.remote` on Workflow bindings and no longer exposes or converts the legacy Workflow `remoteProxyConnectionString` option. Workflows always use the local simulator.
