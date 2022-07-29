---
"wrangler": patch
---

fix: apply multiworker dev facade only when required

This fix makes sure the multiworker dev facade is applied to the input worker only where there are other wrangler dev instances running that are bound to the input worker. We also make sure we don't apply it when we already have a binding (like in remote mode).
