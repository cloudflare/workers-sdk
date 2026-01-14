---
"wrangler": patch
---

Show user-friendly messages for environmental errors

When users experience environmental errors that they cannot fix by modifying their code, Wrangler now displays helpful messages instead of raw error codes. This prevents unnecessary Sentry reports for issues outside of the user's control.

Errors now handled with user-friendly messages:

- Connection timeouts to Cloudflare's API (`UND_ERR_CONNECT_TIMEOUT`) - typically due to slow networks or connectivity issues
- File system permission errors (`EPERM`) - caused by insufficient permissions, locked files, or antivirus software
- DNS resolution failures (`ENOTFOUND`) - caused by network connectivity issues or DNS configuration problems
