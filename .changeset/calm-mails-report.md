---
"miniflare": minor
---

Add JSON output to `/cdn-cgi/local/email`

The `/cdn-cgi/local/email` endpoint now accepts `?format=json` to return the email handler result as JSON. The result includes the handler `outcome`, an optional `rejectReason`, the `forwards` and `replies` the handler produced, and an ordered `events` lifecycle describing everything that happened to the message.
