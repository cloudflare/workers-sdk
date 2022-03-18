---
"wrangler": patch
---

fix: error if a non-legacy service environment tries to define a worker name

Given that service environments all live off the same worker, it doesn't make sense
for them to have different names.

This change adds validation to tell the developer to remove such `name` fields in
service environment config.

Fixes #623
