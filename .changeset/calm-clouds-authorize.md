---
"@cloudflare/workers-auth": minor
---

Request the full registered cf OAuth scope catalog on login

The cf OAuth flow now requests every scope registered for its production OAuth client, allowing cf commands to call the corresponding read and write APIs.
