---
"miniflare": patch
---

Allow local email replies to messages with exactly 100 `References` entries

Email Routing only rejects `message.reply()` when the incoming email has more than 100 entries in its `References` header. Local development also rejected emails with exactly 100 entries, logging that the header had more than 100 entries. Replies to these emails now succeed locally, as they do in production.
