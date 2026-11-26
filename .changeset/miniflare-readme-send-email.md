---
"miniflare": patch
---

Document local Email Sending bindings in the Miniflare README

The README listed Sending Email as not yet supported, although Miniflare simulates `send_email` bindings locally. It now documents the `email.send_email` option, and that local `send()` calls are logged and return a generated message ID instead of delivering the email.
