---
"wrangler": patch
"@cloudflare/vite-plugin": patch
"@cloudflare/vitest-plugin": patch
---

Keep remote bindings working after a failed change to the account or API token is reverted

Previously, changing the account ID or API token to credentials that failed to start a remote session (for example, a malformed account ID) disposed the existing session first. Reverting the change then reused that disposed session, so remote bindings stayed offline until the development server was restarted. The existing session is now disposed only once its replacement is ready, so it keeps working if the new credentials fail to start a session.
