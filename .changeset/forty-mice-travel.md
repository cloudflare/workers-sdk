---
"wrangler": patch
---

fix: strip leading `*`/`*.` from routes when deducing a host for `dev`

When given routes, we use the host name from the route to deduce a zone id to pass along with the host to set with dev `session`. Route patterns can include leading `*`/`*.`, which we don't account for when deducing said zone id, resulting in subtle errors for the session. This fix strips those leading characters as appropriate.

Fixes https://github.com/cloudflare/wrangler2/issues/1002
