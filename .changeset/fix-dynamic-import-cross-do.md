---
"@cloudflare/vitest-pool-workers": patch
---

fix: Support dynamic `import()` inside entrypoint and Durable Object handlers

Previously, calling `exports.default.fetch()` or `SELF.fetch()` on a worker whose handler used a dynamic `import()` would hang and fail with "Cannot perform I/O on behalf of a different Durable Object". This happened because the module runner's transport — which communicates over a WebSocket owned by the runner Durable Object — was invoked from a different DO context.

The fix patches the module runner's transport via the `onModuleRunner` hook so that all `invoke()` calls are routed through the runner DO's I/O context, regardless of where the `import()` originates.
