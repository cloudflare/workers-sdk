---
"miniflare": minor
---

Support `EmailReplyMessageBuilder` when replying from local email handlers

Builder replies now generate the recipient, threading headers, and a production-style Message-ID automatically. Raw `EmailMessage` replies also use a generated production-style Message-ID; user-provided Message-ID headers are rejected in favor of the generated ID.
