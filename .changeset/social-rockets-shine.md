---
"@cloudflare/workers-shared": minor
---

Sanitize double-slashes in asset-worker relative redirects.

Without sanitizing, some relative redirect patterns were being treated as external redirects.
