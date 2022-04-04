---
"wrangler": patch
---

fix: assume a worker is a module worker only if it has a `default` export

This tweaks the logic that guesses worker formats to check whether a `default` export is defined on an entry point before assuming it's a module worker.
