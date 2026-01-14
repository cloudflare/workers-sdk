---
"wrangler": patch
---

Show helpful messages for errors outside of Wrangler's control. This prevents unnecessary Sentry reports.

Errors now handled with user-friendly messages:

- Connection timeouts to Cloudflare's API (`UND_ERR_CONNECT_TIMEOUT`) - typically due to slow networks or connectivity issues
- File system permission errors (`EPERM`, `EACCES`) - caused by insufficient permissions, locked files, or antivirus software
- DNS resolution failures (`ENOTFOUND`) - caused by network connectivity issues or DNS configuration problems
