---
"wrangler": patch
---

fix: refresh token when we detect that the preview session has expired (error code 10049)

When running `wrangler dev`, from time to time the preview session token would expire, and the dev server would need to be manually restarted. This fixes this, by refreshing the token when it expires.

Closes #1446
