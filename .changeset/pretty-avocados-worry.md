---
"wrangler": patch
---

fix: Bulk Secret Draft Worker

Fixes the issue of a upload of a Secret when a Worker doesn't exist yet, the draft worker is created and the secret is uploaded to it.

Fixes https://github.com/cloudflare/wrangler-action/issues/162
