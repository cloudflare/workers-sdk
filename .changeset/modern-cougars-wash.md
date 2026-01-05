---
"@cloudflare/vite-plugin": patch
---

Remove `topLevelName` and `name` when passing `entryWorkerConfig` to the `config `function for auxiliary Workers.

The `name` for each Worker should be unique and the `topLevelName` is computed rather than provided directly.
