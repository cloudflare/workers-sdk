---
"@cloudflare/vite-plugin": patch
---

Enable using `import.meta.hot.send` within the context of a request.

To achieve this, the module runner is now initialized in a Durable Object.
