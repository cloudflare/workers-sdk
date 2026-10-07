---
"@cloudflare/config": patch
---

Fix declaration emit for configs that use Durable Objects or wrap config helpers

Projects that generate TypeScript declarations could not export a Worker that declares a Durable Object (TS4023), wrap a helper such as `bindings.kv()` (TS4058), or re-export `defineConfig`, `defineContainer`, or `defineWorker` (TS7056), and `bindings.json()` values were emitted as `any`. The types these signatures reference are now exported, including every helper's options type (such as `KvBindingOptions`), `Json`, `DefaultModule`, and the Container config variants, and the `define*` helpers are now function declarations that declarations can refer to by name.
