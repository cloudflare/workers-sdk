---
"miniflare": patch
---

Return `EmailSendResult` from the `send_email` binding's `send()` in local mode

The binding's `send()` used to resolve to `undefined`. It now returns `{ messageId: string }`, the same shape as the public `SendEmail` type in production. Workers that read the return value (for logging, or to pass the id downstream) no longer get `undefined` under miniflare.

On the `EmailMessage` path, the parsed `Message-ID` header is returned with its angle brackets stripped. On the `MessageBuilder` path miniflare doesn't assemble MIME locally, so the id is synthesized as `<32 hex chars>@example.com`, which is the same format the `forward()` path already uses.
