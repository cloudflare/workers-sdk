---
"wrangler": patch
---

Disable Sentry error reporting by default

`WRANGLER_SEND_ERROR_REPORTS` now defaults to `false` instead of prompting on every error. The current prompt produces too many false-positive reports. Users can still opt in explicitly by setting `WRANGLER_SEND_ERROR_REPORTS=true`.
