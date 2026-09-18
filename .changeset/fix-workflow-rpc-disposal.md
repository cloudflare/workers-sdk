---
"@cloudflare/workflows-shared": patch
"miniflare": patch
"@cloudflare/vitest-plugin": patch
---

Dispose Workflow step results and introspection modifiers after use

Release RPC resources deterministically during local Workflow execution and introspection. This prevents undisposed RPC warnings and requests being cancelled after their execution context has ended. Live step results retain their original data shape, including typed-array offsets and backing buffers.
