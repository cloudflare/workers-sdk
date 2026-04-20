---
"miniflare": patch
---

Return `EmailSendResult` from the `send_email` binding's `send()` in local mode

The binding's `send()` used to resolve to `undefined`. It now returns `{ messageId: string }`, the same shape as the public `SendEmail` type in production. Workers that read the return value (for logging, or to pass the id downstream) no longer get `undefined` under miniflare.

Both branches synthesize an id in the shape production returns — `<{36 alphanumeric chars}@{sender domain}>`, angle brackets included — using the envelope `from` for the `EmailMessage` path and the builder's `from` for the `MessageBuilder` path. Production synthesizes its own id rather than echoing anything submitted, so miniflare does the same.
