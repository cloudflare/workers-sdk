---
"wrangler": patch
---

Fix sourcemap mapping for startup/global scope errors in dev mode

Errors thrown at startup time (module initialization) now properly display source-mapped stack traces that point to the original source code instead of the bundled output. This fix ensures that when `wrangler dev` encounters an error during worker initialization, developers can see the exact line in their TypeScript/JavaScript source files where the error occurred.

The fix works by passing a sourcemap retriever function to `getSourceMappedStack()` when handling `Runtime.exceptionThrown` events in the ProxyController. This retriever function maps module names to their file paths and then retrieves the corresponding sourcemap files using the bundle's metadata.
