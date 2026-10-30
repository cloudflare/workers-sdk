---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Validate OAuth error callbacks against the pending login

All authorization callbacks, including ones without a code or error, now require the matching login state. Unrelated callbacks leave the login running so the authorization page can complete it, and control characters in provider error messages are displayed as escaped text.
