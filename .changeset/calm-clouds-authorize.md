---
"@cloudflare/workers-auth": minor
---

Expand cf OAuth permissions to the full public API surface

The cf OAuth flow now requests the API token-derived permissions registered for its OAuth client, allowing cf commands to call the corresponding read and write APIs.
