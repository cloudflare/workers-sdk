---
"wrangler": patch
---

feat: optionally send `zone_name` with routes

A followup to https://github.com/cloudflare/wrangler2/pull/778, this lets you send an optional `zone_name` with routes. This is particularly useful when using ssl for saas (https://developers.cloudflare.com/ssl/ssl-for-saas/).

Fixes https://github.com/cloudflare/wrangler2/issues/793
