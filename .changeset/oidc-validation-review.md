---
"@cloudflare/workers-utils": minor
"miniflare": minor
---

Reject malformed audiences consistently in experimental Workers OIDC

Use the signer's exact URI grammar in configuration and local issuance. Reject hidden binding fields, malformed identifiers, and whitespace-only audiences before requesting a session or token.
