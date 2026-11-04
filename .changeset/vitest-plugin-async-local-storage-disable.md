---
"@cloudflare/vitest-plugin": patch
---

Fix `vi.mock()` factories failing under Vitest 5.1

Vitest 5.1 calls `AsyncLocalStorage#disable()` after a mock factory settles, but workerd throws `asyncLocalStorage.disable() is not implemented` from it. Any test file using `vi.mock()` with a factory failed during import.

The plugin now makes `AsyncLocalStorage#disable()` a no-op inside the Workers test runtime, so mocked imports work again.
