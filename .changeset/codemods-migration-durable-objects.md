---
"@cloudflare/codemods": patch
---

Infer Durable Object exports from Wrangler migration history

The codemod uses checked-in class creation, rename, and deletion history to emit lifecycle exports with the correct storage backend. It keeps blocking follow-ups when the history cannot identify an export or transfer.
