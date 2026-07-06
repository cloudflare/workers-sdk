---
"miniflare": patch
---

Support builder-style email replies in local development

`ForwardableEmailMessage.reply()` now accepts an email reply builder in addition to an `EmailMessage`. Miniflare now synthesizes the local reply MIME with threading headers so this overload works during local development.
