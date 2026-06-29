---
"wrangler": patch
---

Fix Workers Assets deploys failing for filenames that require URI encoding

Wrangler now URI-encodes asset manifest paths before starting an assets upload session. This prevents the Cloudflare API from rejecting deployments containing filenames with spaces, non-ASCII characters, or reserved URL characters.
