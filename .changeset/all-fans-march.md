---
"@cloudflare/workflows-shared": minor
---

Add support for ReadableStream on workflow steps. This allows users to overcome the 1MB limit per step output.

`ReadableStream<Uint8Array>` is already serializable on the workers platform. This feature makes it native to workflows as well by persisting each chunk and replaying it if needed
