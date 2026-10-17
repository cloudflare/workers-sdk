---
"@cloudflare/vitest-plugin": patch
---

Keep large Vitest RPC messages within workerd WebSocket limits

Vitest 5 can send a warmed module graph in a single RPC payload. Split oversized serialized messages into bounded WebSocket frames and reassemble them before parsing so a large setup-file import does not terminate the worker before later test files run.
