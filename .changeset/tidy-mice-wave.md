---
"wrangler": patch
---

Read workers.dev URLs from the Worker resource during deployment

Wrangler no longer requires account-level subdomain permission to display Worker and version-preview URLs. It now uses the Worker-scoped URL fields while preserving account-level registration for accounts without a workers.dev subdomain.
