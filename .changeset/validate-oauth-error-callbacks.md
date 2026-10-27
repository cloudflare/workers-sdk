---
"@cloudflare/workers-auth": patch
"wrangler": patch
---

Validate OAuth error callbacks against the pending login

Both successful and failed authorization callbacks now require the matching login state. Unrelated callbacks leave the login running so the authorization page can complete it, and control characters in provider error messages are displayed as escaped text.
