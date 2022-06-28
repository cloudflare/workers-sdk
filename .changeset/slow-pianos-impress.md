---
"wrangler": patch
---

fix: normalise `account_id = ''` to `account_id: undefined`

In older templates, (i.e made for wrangler 1.x), `account_id =''` is considered as a valid input, but then ignored. With wrangler 2, when running wrangler dev, we log an error, but it fixes itself after we get an account id. Much like https://github.com/cloudflare/wrangler2/issues/1329, the fix here is to normalise that value when we see it, and replace it with `undefined` while logging a warning.

This fix also tweaks the messaging for a blank route value to suggest some user action.
