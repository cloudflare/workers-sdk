---
"wrangler": patch
---

feat: add metricsEnabled header to CF API calls when developing or deploying a worker

This allows us to estimate from API requests what proportion of Wrangler
instances have enabled usage tracking, without breaking the agreement not
to send data for those who have not opted in.
