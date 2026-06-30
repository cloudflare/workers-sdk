---
"wrangler": patch
---

Improve Workers Assets manifest validation diagnostics

When the Cloudflare API rejects an assets upload session because a manifest path must be URI encoded, Wrangler now logs candidate asset paths containing URI-sensitive characters. This helps identify the file that triggered the API error without changing the manifest paths sent to the API.
