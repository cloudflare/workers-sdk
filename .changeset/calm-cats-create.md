---
"@cloudflare/workers-auth": minor
---

Allow cf to request the account token creation scope

New cf OAuth logins can request `account_api_tokens:create`. Existing sessions must authenticate again to receive the scope.
