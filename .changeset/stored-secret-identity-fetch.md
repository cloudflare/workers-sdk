---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"miniflare": minor
"@cloudflare/vite-plugin": minor
---

Add stored-secret authentication to draft managed identity fetch

Configure client_secret_basic or client_secret_post using a private Secrets Store reference. Permit omitted scope/resource only for this flow, default it to Bearer, and support explicit required DPoP. Keep the existing fetch API and earlier compiled behavior. Share strict configuration validation and private local secret access across development tooling.
