---
"@cloudflare/vite-plugin": minor
---

Support `oidc_tokens` bindings in Vite builds

Vite validates OIDC audiences and preserves the binding's audience and optional signing algorithm in the generated Wrangler configuration. OIDC tokens identify the deployed Worker; signing tokens remains unsupported in local development.
