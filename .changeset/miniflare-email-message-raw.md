---
"miniflare": patch
---

Expose `EmailMessage.raw` in local development

Miniflare now matches the Workers API by exposing the message body as a readable byte stream. This works whether you construct the message from a string or an existing stream.
