---
"wrangler": patch
---

fix: Error if Workers + Assets are run in remote mode

Workers + Assets are currently supported only in local mode. We should throw an error if users attempt to use Workers with assets in remote mode.
