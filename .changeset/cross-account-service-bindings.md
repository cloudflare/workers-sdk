---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"@cloudflare/deploy-helpers": minor
"@cloudflare/remote-bindings": minor
"@cloudflare/codemods": minor
"wrangler": minor
"miniflare": patch
---

Support public target account IDs on service bindings between accounts in the same Cloudflare Organization. Deployment requires write access to the source and target Workers. Cross-account local development uses an authorized remote session or an explicit local mock.
