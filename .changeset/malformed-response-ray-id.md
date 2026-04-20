---
"wrangler": patch
---

Include Cloudflare Ray ID in the "malformed response" API error

When the Cloudflare API returns non-JSON content that isn't detected as a WAF block page, the resulting "Received a malformed response from the API" error now includes the Cloudflare Ray ID (from the `cf-ray` header) when available. This makes it easier to reference the failing request in support tickets.
