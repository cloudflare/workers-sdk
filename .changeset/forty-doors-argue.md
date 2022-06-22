---
"wrangler": patch
---

polish: bundle reporter was not printing during publish errors

The reporter is now called before the publish API call, printing every time.

resolves #1328
