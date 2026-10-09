---
"@cloudflare/config": patch
---

Fix declaration emit for configs that use Durable Objects or wrap config helpers

Projects that generate TypeScript declarations can now export a Worker that declares a Durable Object, wrap helpers such as `bindings.kv()`, and re-export `defineConfig`, `defineContainer`, or `defineWorker`. Helper options types such as `KvBindingOptions` can now be imported by name, and `bindings.json()` values are no longer emitted as `any`.
