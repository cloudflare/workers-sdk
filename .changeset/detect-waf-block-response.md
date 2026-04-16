---
"wrangler": patch
---

Detect Cloudflare WAF block pages and show a helpful error message instead of "Received a malformed response from the API"

When the Cloudflare WAF blocks an API request, the response is an HTML page rather than JSON. Previously, this caused a confusing "Received a malformed response from the API" error with a truncated HTML snippet. Wrangler now detects WAF block pages and displays a clear error message explaining that the request was blocked by the firewall, along with the Cloudflare Ray ID (when available) for use in support tickets.
