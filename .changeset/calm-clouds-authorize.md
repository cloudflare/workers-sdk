---
"@cloudflare/workers-auth": minor
---

Request every grantable scope registered for the cf OAuth client on login

The cf OAuth flow now requests all 468 scopes that are both accepted for its production client and grantable by the consent service, allowing cf commands to call the corresponding APIs. Six client-registered scopes without consent mappings remain excluded so browser and device login do not fail during authorization.
