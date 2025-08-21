---
"@cloudflare/vite-plugin": minor
---

Enable service bindings and tail handlers to named entrypoints and auxiliary workers

You can now define service bindings and tail handlers to workers running in other dev processes, even if they are auxiliary workers or named entrypoints. Previously, only the default export of entry workers could be connected across processes.
