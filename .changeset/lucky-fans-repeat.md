---
"wrangler": patch
---

fix: Remove `request.clone()` from Pages functions when possible

When using the `/functions` directory requests get cloned unconditionally, such request bodies
can not be read causing workerd errors regarding unused streams and wasted memory.

These changes prevent `request.clone()` for routes containing a single handler, resolving the
above issue for such simple type of routes.

Routes with multiple handlers (with middlewares for example) sill generate clones unconditionally,
such routes cannot be amended in a non breaking way, so they will be amended at a later time before
a new major release of wrangler.
