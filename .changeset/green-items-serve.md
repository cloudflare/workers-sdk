---
"wrangler": patch
---

Fix usage of patch API in bulk secrets update

Only specifying the name and type of a binding instructs the patch API to copy the existing binding over - but we were including the contents of the binding as well. Normally that's OK, but there are some subtle differences between what you specify to _create_ a binding vs what it looks like once it's _created_, specifically for Durable Objects. So instead, we just use the simpler inheritance.
