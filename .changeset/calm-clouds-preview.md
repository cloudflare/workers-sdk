---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Add a provisioning delay note when custom domain Preview URLs change

Wrangler now explains that DNS and TLS certificate provisioning may continue after a deploy adds a custom domain or enables its Preview URLs. Stable redeploys don't repeat the note.

This assumes that a request which matches the stored custom domain state doesn't restart provisioning. The client infers this from the API changeset and current domain record because this repository can't verify the backend behavior.
