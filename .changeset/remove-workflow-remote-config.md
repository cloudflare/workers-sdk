---
"wrangler": patch
"@cloudflare/config": patch
---

Remove unsupported `remote` configuration from Workflow bindings

Workflow bindings no longer accept `remote` in configuration, as remote Workflow bindings have never actually been supported.
