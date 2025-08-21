---
"@cloudflare/workers-shared": patch
---

Sanitize double-slashes in asset-worker relative redirects.

Without sanitizing, some relative redirect patterns were being treated as external redirects.
