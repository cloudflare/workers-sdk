---
"@cloudflare/deploy-helpers": patch
"wrangler": patch
---

Honor Retry-After directives during static asset uploads

Static asset uploads now pause retries and pending uploads until the latest outstanding deadline requested by the API. A per-request limiter also keeps gateway retries at the reduced concurrency after the pause ends, preventing a deployment from immediately overloading a constrained asset service again.
