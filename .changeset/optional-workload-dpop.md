---
"@cloudflare/config": minor
"@cloudflare/workers-utils": minor
"wrangler": minor
"miniflare": patch
"@cloudflare/codemods": minor
---

Support optional DPoP policy for experimental managed identity OAuth

Configure `oauth.dpop` as `preferred` (the default), `required`, or `disabled` in either configuration format. Preserve legacy `require_sender_constraint: true` as required DPoP and reject conflicting policies. Local identity issuance remains unsupported.
