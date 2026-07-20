---
"@cloudflare/vitest-pool-workers": patch
---

Fix a non-ASCII path failure during the Miniflare WebSocket handshake: the `MF-Vitest-Worker-Data` header embedded the raw `process.cwd()` value, which threw a Latin-1/ASCII header encoding error when the workspace path contained non-ASCII characters (e.g. CJK characters) on Windows. The value is now percent-encoded on write and decoded on read, matching the fix applied to the module fallback redirect response.
