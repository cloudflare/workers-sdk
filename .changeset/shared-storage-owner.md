---
"miniflare": minor
---

Add experimental `unsafeSharedStorageOwner` option to share local storage across processes

When several Miniflare instances run against the same persist root (for example multiple `wrangler dev` / `vite dev` sessions), each one opens the same SQLite and blob files, which can produce cross-process `SQLITE_BUSY` errors under concurrent access. With `unsafeSharedStorageOwner` enabled, a single detached "owner" process opens the storage files and every other instance routes its KV, R2, D1, Images, Streams and Secrets Store operations to that owner over the remote-bindings boundary, so exactly one process performs storage I/O. The owner is elected and spawned automatically, publishes its address to the persist root, and self-terminates once no instances remain.

The option is off by default. Cache, Durable Objects and Workflows are intentionally kept per-instance rather than routed, so processes never contend on those databases.
