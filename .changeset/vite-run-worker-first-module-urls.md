---
"@cloudflare/vite-plugin": patch
---

Serve Vite's module URLs before `run_worker_first` in dev

When `run_worker_first` is `true` or includes a broad pattern such as `"/*"`, requests for Vite's own module URLs (for example `/@vite/client`, `/@id/*`, `/@fs/*`, and JS and CSS source files) were sent to the Worker during development. A Worker that does not handle those paths returned a 404, so the page never hydrated and no CSS loaded. Vite now serves these URLs first. Page navigations, public files, other files in the project, and all other matching requests still go to the Worker.
