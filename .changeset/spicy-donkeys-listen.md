---
"@cloudflare/vite-plugin": patch
---

Dispose remote proxy sessions when the dev or preview server closes

With `remoteBindings` enabled, `vite build` wrote all of its output and then hung forever, because each remote proxy session runs a listening server that keeps the event loop alive. Sessions were only ever disposed to replace one whose auth had changed, so nothing tore them down when the prerender pass finished and the preview server closed. They are now disposed when the dev or preview server closes, letting the build exit normally.
