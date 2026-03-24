---
"wrangler": patch
---

fix: prevent Docker container builds from spawning console windows on Windows

On Windows, `detached: true` in `child_process.spawn()` gives each child process its own visible console window, causing many windows to flash open during `wrangler deploy` with `[[containers]]`. The `detached` option is now only set on non-Windows platforms (where it is needed for process group cleanup), and `windowsHide: true` is added to further suppress console windows on Windows.
