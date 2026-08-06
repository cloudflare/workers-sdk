---
"miniflare": patch
---

Fix local development failing to start with deleted or transferred Durable Object classes

Projects with Durable Object tombstones in their Worker output configuration now start correctly in local development. Live Durable Object classes, including classes expecting a transfer, continue to be registered.
