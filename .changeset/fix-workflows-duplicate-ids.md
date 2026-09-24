---
"miniflare": patch
"wrangler": patch
---

Emulate the deterministic-ID uniqueness contract in the local Workflows binding

The local Workflows binding now matches the documented production behavior for deterministic instance IDs: `create({ id })` with an ID that already exists throws `(instance.already_exists)` and retains the existing instance, and `createBatch()` skips IDs that already exist or repeat within the batch, excluding them from the result instead of creating duplicate executions. Previously both paths silently created duplicates, so code relying on deterministic IDs for idempotency (for example a Queue consumer creating one workflow per message) appeared to work locally while double-executing workflow bodies.
