---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Improve authentication error messages with specific failure reasons

When authentication fails (e.g. during `wrangler dev --remote` or when using remote bindings), the error message now explains exactly what went wrong -- whether no credentials were found, the token expired, or the environment is non-interactive -- and lists actionable steps to fix it, including a `wrangler whoami` tip.

Previously, auth failures could produce multiple confusing errors (e.g. "Failed to fetch auth token: 400 Bad Request" followed by "Failed to start the remote proxy session"). Now a single, clear error is shown.
