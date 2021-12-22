---
"wrangler": patch
---

Improve validation message for `kv:namespace create`

Previously, if the user passed multiple positional arguments (which is invalid)
the error message would suggest that these should be grouped in quotes.
But this is also wrong, since a namespace binding name must not contain spaces.
