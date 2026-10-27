---
"@cloudflare/vitest-plugin": patch
---

Fix test runners failing to start with large shared import graphs

Chunk large messages between the Vitest pool and workerd runner to stay below workerd's 32 MiB WebSocket message limit. This prevents warm-module snapshots from closing the connection with code 1009 and leaving test files unexecuted.
