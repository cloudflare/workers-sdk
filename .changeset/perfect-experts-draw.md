---
"wrangler": patch
---

fix: render a helpful build error if a Service Worker mode Worker has imports

A common mistake is to forget to export from the entry-point of a Worker, which causes
Wrangler to infer that we are in "Service Worker" mode.

In this mode, imports to external modules are not allowed.
Currently this only fails at runtime, because our esbuild step converts these imports to an internal `__require()` call that throws an error.
The error message is misleading and does not help the user identify the cause of the problem.
This is particularly tricky where the external imports are added by a library or our own node.js polyfills.

Fixes #6648
