---
"wrangler": patch
---

Improve Workers Assets manifest validation diagnostics

When the Cloudflare API rejects an assets upload session because a manifest path must be URI encoded, Wrangler now logs asset paths that fail URI decoding. This helps identify filenames with malformed percent escapes without changing the manifest paths sent to the API.
