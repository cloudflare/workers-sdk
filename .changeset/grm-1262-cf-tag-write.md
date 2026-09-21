---
"@cloudflare/workers-auth": minor
---

Include Account Tag Write in the default CF CLI OAuth scopes

New CF CLI logins now request permission to manage account resource tags. Existing sessions must reauthenticate to receive the additional scope.
