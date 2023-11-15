---
"wrangler": patch
---

Adds a --force flag to wrangler tail to implicitly accept any confirmation prompts. This includes the prompt when using tail on a Worker with a Durable Object, as tail will reset any active connections.
