---
"miniflare": major
---

Remove internal or redundant options from Miniflare's config

Miniflare no longer accepts service designator objects such as `{ network }`, `{ external }`, and `{ disk }` on `outboundService`, `tails`, or `streamingTails`.

Miniflare also no longer supports `unsafeExcludeFromObservability`, which has been dropped in favour of `unsafeRegisterWorker`.
