---
"@cloudflare/vitest-plugin": patch
---

Fix `vi.mock()` factories failing under Vitest 5.1

Mock factories in `vi.mock()` now work when running tests with Vitest 5.1 and later. Previously, any test file that used a mock factory failed during import with `asyncLocalStorage.disable() is not implemented`.
