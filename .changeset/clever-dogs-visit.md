---
"wrangler": minor
"@cloudflare/deploy-helpers": patch
"@cloudflare/workers-utils": patch
---

Add hidden Durable Object namespace creation paths for internal regions

Cloudflare employees can now create SQLite-backed Durable Object namespaces in
DOG or VET with `wrangler durable-object namespace create`. Deploys can also
set `durable_objects.bindings[].namespace.default_region` to create the
namespace before uploading the Worker, while EWC still enforces account
capability checks for these internal regions.
