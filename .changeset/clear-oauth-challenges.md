---
"@cloudflare/workers-auth": patch
---

Show an actionable error when Cloudflare challenges OAuth requests from the user's IP address.

Device login, authorization-code exchange, and token refresh now identify the challenge and include its Ray ID when available. The message points users to `CLOUDFLARE_API_TOKEN` while the dashboard challenge prevents OAuth authentication.
