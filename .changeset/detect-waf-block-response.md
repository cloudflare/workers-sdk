---
"wrangler": patch
---

Detect Cloudflare WAF block pages and include Ray ID in API error messages

When the Cloudflare WAF blocks an API request, the response is an HTML page rather than JSON. Previously, this caused a confusing "Received a malformed response from the API" error with a truncated HTML snippet. Wrangler now detects WAF block pages and displays a clear error message explaining that the request was blocked by the firewall, along with the Cloudflare Ray ID (when available) for use in support tickets.

For other non-JSON responses that aren't WAF blocks, the "malformed response" error also now includes the Ray ID to help reference failing requests in support tickets.
