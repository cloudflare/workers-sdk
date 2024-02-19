---
"wrangler": patch
---

fix: allow kv:namespace create to accept a namespace name that contains characters not allowed in a binding name

This command tries to use the namespace name as the binding. Previously, we would unnecessarily error if this namespace name did not fit the binding name constraints. Now we accept such names and then remove invalid characters when generating the binding name.
