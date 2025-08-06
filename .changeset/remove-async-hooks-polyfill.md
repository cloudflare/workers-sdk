---
"@cloudflare/unenv-preset": major
"wrangler": patch
---

Remove async_hooks polyfill - now uses native workerd implementation

The async_hooks module is now provided natively by workerd, making the polyfill unnecessary. This change:

- Moves async_hooks from hybridModules to nativeModules in unenv-preset
- Removes the async_hooks polyfill implementation
- Adds comprehensive tests for async_hooks functionality including AsyncLocalStorage and AsyncResource
- Ensures backward compatibility with existing code using async_hooks APIs

AsyncLocalStorage and AsyncResource are fully functional in the native implementation, while other APIs like createHook, executionAsyncId, etc. provide stub implementations for compatibility.
