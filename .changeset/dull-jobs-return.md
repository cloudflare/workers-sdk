---
"wrangler": patch
---

feat: optionally send zone_id with a route

This enables optionally passing a route as `{pattern: string, zone_id: string}`. There are scenarios where we need to explicitly pass a zone_id to the api, so this enables that.

Some nuance: The errors from the api aren't super useful when invalid values are passed, but that's something to further work on.

This also fixes some types in our cli parsing.

Fixes https://github.com/cloudflare/wrangler2/issues/774
