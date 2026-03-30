---
"miniflare": patch
---

Fix noisy EBUSY errors on Windows when disposing Miniflare instances

On Windows, `workerd` may not release file handles immediately after disposal, causing `EBUSY` errors when Miniflare tries to remove its temporary directory during `dispose()`. Previously, this error propagated to the caller (e.g. vitest-pool-workers), producing repeated noisy error messages in test output. The cleanup is now best-effort — matching the existing exit hook behaviour — since the temporary directory lives in `os.tmpdir()` and will be cleaned up by the OS.
