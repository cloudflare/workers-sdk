---
"wrangler": patch
"@cloudflare/workers-auth": patch
---

Show the actual OAuth error instead of hanging when `wrangler login` is rejected by the OAuth provider (for example with `invalid_scope`).

Previously, if the OAuth callback returned with an `error` other than `access_denied`, Wrangler would never respond to the browser. Because `server.close()`'s callback only fires once all open connections have ended, the login command would hang until the 120 second OAuth timeout — at which point it would print a generic timeout message rather than the actual OAuth failure. The same gap existed for the case where the OAuth provider redirected back without an authorisation code, and for failures during the auth-code-to-access-token exchange.

The OAuth provider's `error_description` (RFC 6749 §4.1.2.1) is now also surfaced, so the message includes the specific reason for the failure rather than just the bare `error` code. For example, a misconfigured staging scope now surfaces as:

```
OAuth error: invalid_scope
  The OAuth 2.0 Client is not allowed to request scope 'browser:write'.
```

instead of hanging silently.
