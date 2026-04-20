---
"@cloudflare/vitest-pool-workers": patch
---

fix: Restore workflow binding before async cleanup in `WorkflowIntrospectorHandle.dispose()`

Previously, `dispose()` awaited all instance abort operations before restoring the original `env` binding. On slower CI environments (especially Windows), this left a window where the next test could see a stale proxy, causing "Trying to mock step multiple times" errors or failed introspection. The binding is now restored synchronously before the async instance cleanup begins.
