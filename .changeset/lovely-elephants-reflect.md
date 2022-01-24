---
"wrangler": patch
---

fix: warn if the `site.entry-point` configuration is found during publishing

Also updates the message and adds a test for the error when there is no entry-point specified.

Fixes #282
