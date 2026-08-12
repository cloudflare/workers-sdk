---
"@cloudflare/config": patch
---

Add R2 local S3 credentials to the shared config binding shape

R2 bindings now support `localDev.experimentalS3Credentials`, matching Wrangler's existing local S3 endpoint credentials configuration.
