---
"@cloudflare/workers-auth": patch
---

Request the user API token management scope when logging in with cf

Include `user-api-tokens.write` in cf's default OAuth scopes so users can list and manage their user API tokens, including when they have reached the token creation limit. Existing OAuth sessions need a new login to request the scope.
