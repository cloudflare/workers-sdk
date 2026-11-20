---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Recover when concurrent `wrangler preview` builds try to create the same Preview name.

If another build creates a Preview after the initial lookup, Wrangler now reads the existing Preview and applies the requested Preview settings instead of failing with Cloudflare API error 100338. Other creation errors still fail, and existing Previews are never deleted.
