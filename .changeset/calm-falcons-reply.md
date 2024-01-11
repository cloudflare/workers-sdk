---
"wrangler": patch
---

fix: only offer to report unknown errors

Previously, Wrangler would offer to report any error to Cloudflare. This included errors caused by misconfigurations or invalid commands. This change ensures those types of errors aren't reported.
