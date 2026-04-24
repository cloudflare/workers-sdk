---
"miniflare": patch
---

Make the dev registry watcher reliable on Windows

The filesystem-based dev registry used `chokidar` with default settings, which on Windows backs onto `fs.watch` (`ReadDirectoryChangesW`). That API is known to drop or delay create events for files added shortly after the watcher attaches, which is especially common under CI virtualization. When this happened, a process that had attached its watcher before another process registered its worker would never be notified of the new entry until the next 30-second heartbeat — long enough to time out cross-process service-binding calls.

Switch to chokidar's polling mode on Windows so the dev registry observes cross-process worker registrations reliably. The registry directory is small and a 100ms poll interval has negligible cost. Non-Windows platforms continue to use the more efficient native filesystem-event backend.
