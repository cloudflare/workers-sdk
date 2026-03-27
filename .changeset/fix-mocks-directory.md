---
"@cloudflare/vitest-pool-workers": patch
---

Support `__mocks__` directories for `vi.mock()` without a factory

When calling `vi.mock("some-module")` without providing a factory function, Vitest looks for a corresponding file in a `__mocks__` directory. This was not working in `@cloudflare/vitest-pool-workers` because the mock resolution uses `node:fs` filesystem operations (`existsSync`, `readdirSync`) that don't have access to the host filesystem inside workerd.

The fix routes `__mocks__` directory lookups through the existing loopback service binding, which runs on the Node.js pool side where filesystem access works. This is done by overriding the mocker's `resolveMocks()` method via the `onModuleRunner` hook to pre-fetch redirect paths asynchronously before the synchronous `findMockRedirect()` is called.
