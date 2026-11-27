---
"miniflare": patch
---

Keep running when the dev registry can't be watched for changes

When a Worker binds to a service in another dev session, Miniflare watches the dev registry directory. If the system refused that watch, such as `EMFILE` once macOS runs out of FSEvents streams or `ENOSPC` once Linux reaches its inotify watch limit, the error went unhandled and crashed the dev server. Miniflare now logs a warning and polls the registry for changes instead, so service bindings across dev sessions keep working.
