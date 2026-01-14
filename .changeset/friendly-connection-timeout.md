---
"wrangler": patch
---

Show user-friendly message for Cloudflare API connection timeouts

When users experience connection timeouts to Cloudflare's API (typically due to slow networks or connectivity issues), Wrangler now displays a helpful message instead of the raw `UND_ERR_CONNECT_TIMEOUT` error. This prevents unnecessary Sentry reports for environmental issues that users cannot fix by modifying their code.
