---
"miniflare": patch
---

Fix Local Explorer dropping `send_email` messages that use `EmailAddress` without `name`

`formatEmailAddress` now treats a missing or empty `name` like `formatParsedAddress`, formatting `{ email }` as a bare address string so capture and MessageBuilder logs no longer throw.
