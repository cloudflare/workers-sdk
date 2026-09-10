---
"miniflare": minor
---

Add `Miniflare#dispatchConnect()` for testing Worker TCP handlers

Tests can now open a Node.js socket to a Worker's configured TCP trigger without reserving and connecting to a fixed port manually. Miniflare waits for startup, resolves OS-assigned ports, supports selecting Workers and triggers, and closes dispatched sockets during disposal.
