---
"@cloudflare/vite-plugin": patch
---

Fix crash when plugins send HMR events before runner initialization

Previously, if another Vite plugin (such as `vite-plugin-vue-devtools`) sent HMR events during `configureServer` before the Cloudflare plugin had initialized its runner, the dev server would crash with `AssertionError: The WebSocket is undefined`. The environment's WebSocket operations are now deferred until the runner is fully initialized, allowing early HMR events to be handled gracefully.
