---
"@cloudflare/local-explorer-ui": minor
"miniflare": minor
---

Add row-level email resend tools to the Local Explorer

Routing captures can now be resent directly or loaded into the test email composer for editing. Routing rows expose and use a UUID-based capture ID for identity, detail lookup, and resend operations instead of relying on the email's Message-ID. Message-ID detail lookup remains available for compatibility, and resends preserve partial-capture warnings across replayed messages.
