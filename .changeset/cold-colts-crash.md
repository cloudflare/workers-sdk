---
"@cloudflare/vite-plugin": patch
---

Fix issue that resulted in `A hanging Promise was canceled` errors when developing large applications.
We now handle requests for modules in a Durable Object so that they can be shared across invocations.

Additionally, using `import.meta.hot.send` within the context of a request is now supported.
