---
"wrangler": patch
---

fix: validation for R2 bucket names, the regex was wrongly rejecting buckets starting with a number and the message wasn't as clear as it could be on what was going wrong.
