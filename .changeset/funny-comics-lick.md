---
"wrangler": minor
---

feature: log version preview url when previews exist

The version upload API returns a field indicating whether
a preview exists for that version. If a preview exists and
workers.dev is enabled, wrangler will now log the full
URL on version upload.

This does not impact wrangler deploy, which only prints the
workers.dev route of the latest deployment.
