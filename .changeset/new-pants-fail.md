---
"wrangler": patch
---

remove warnings during config validations on `experimental_remote` fields

as part of the remote bindings feature we've introduced the
`experimental_remote` flag that users can set to bindings in their config
files, we've implemented this so that wrangler would not recognize the field
(and consequently show relevant warnings) when the `--x-remote-bindings` flag
is not provided

this behavior is beneficial for `wrangler dev` but it is unnecessary and potentially
confusing for other commands such as `wrangler dev`, so we've decided to loosen up
this validation and make wrangler always recognize the field regardless on the
`--x-remote-bindings` flag
