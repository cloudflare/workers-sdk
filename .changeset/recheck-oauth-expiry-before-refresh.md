---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Avoid redundant OAuth refreshes after a sibling process updates credentials

Check access-token expiry and select the refresh token from the same fresh credential snapshot. When a sibling has already saved a valid access token, reuse it without another exchange or write. This prevents an unnecessary rotation that can let an older response overwrite a newer refresh token.
