---
"wrangler": patch
---

Report the R2 bucket location returned by the API when creating a bucket

`wrangler r2 bucket create --location` printed the requested location hint even when R2 ignored it. Recreating a deleted bucket name keeps the original location, so the success message could claim a placement the bucket does not have. The command now uses the location from the create response: it mentions the hint only when that location matches, and otherwise reports the location R2 actually applied.
