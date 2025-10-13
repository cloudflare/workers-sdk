---
"wrangler": minor
---

feat: add `watch_ignore` configuration option to prevent infinite rebuild loops

Adds a new `watch_ignore` field to the `[build]` section of `wrangler.toml` that allows users to specify glob patterns for files and directories to ignore during watch mode. This helps prevent infinite rebuild loops caused by code generators like Paraglide.js or build outputs like `.svelte-kit`.

Fixes #10970