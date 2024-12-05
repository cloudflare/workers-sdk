---
"wrangler": patch
---

fix: relax validation of unsafe configuration to allow an empty object

The types, the default and the code in general support an empty object for this config setting.

So it makes sense to avoid erroring when validating the config.
