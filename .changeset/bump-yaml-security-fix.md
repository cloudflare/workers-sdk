---
"wrangler": patch
---

Bump bundled `yaml` from 2.8.1 to 2.9.0 to pick up a security fix

`yaml` is bundled into Wrangler, which uses it to show container application details. Version 2.8.1 is affected by a published advisory, and versions from 2.8.3 onwards include the fix. Output does not change.
