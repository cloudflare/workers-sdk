---
"@cloudflare/workers-utils": minor
"@cloudflare/config": minor
"@cloudflare/codemods": minor
"wrangler": minor
---

Add explicit Web Bot Auth composition to experimental managed OAuth identity bindings

Set `oauth.http_message_signatures: "web_bot_auth"` to sign the final OAuth and DPoP authenticated request in either managed exchange mode. Configuration validation, migration, generated consumers and upload metadata preserve this optional field. The receiving service must verify both protocols and associate the OAuth principal with the WBA identity. Existing fetch method signatures and OAuth-only configuration remain unchanged.
