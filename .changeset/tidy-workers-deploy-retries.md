---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Recover from transient API failures when publishing an uploaded Worker version

Retry deployment-history reads and the final version publication with bounded deadlines. Before repeating a failed publication, check whether the requested version is already live; stop if a different deployment has replaced it. This does not rerun the build, upload, or a custom deploy command.
