---
"miniflare": patch
---

Fix potential EBADF error when restarting workerd process

Previously, when the workerd process was restarted (e.g., via `setOptions()` or Vite server restart), the stdio pipes from the previous process were not explicitly destroyed. This could lead to `EBADF` (Bad File Descriptor) errors during spawn on some systems.

The `Runtime#dispose()` method now explicitly destroys all stdio streams (stdin, stdout, stderr, and the control pipe) before killing the process to ensure file descriptors are properly released.
