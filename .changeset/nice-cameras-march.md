---
"wrangler": patch
---

fix: make it possible for values in vars and defines to have colons (:)

Prior to this change, passing --define someKey:https://some-value.com would result in an incomplete value being passed to the Worker.

This change correctly handles colons for var and define in `wrangler dev` and `wrangler publish`.
