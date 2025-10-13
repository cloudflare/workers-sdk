---
"wrangler": minor
---

feat: Add `watch_ignore` configuration option to prevent infinite rebuild loops

Adds a new `watch_ignore` field to the `[build]` section of `wrangler.toml` that allows users to specify glob patterns for files and directories to ignore during watch mode. This helps prevent infinite rebuild loops caused by code generators like Paraglide.js or build outputs like `.svelte-kit`.

Example configuration:
```toml
[build]
command = "pnpm build"
watch_dir = "src"
watch_ignore = ["lib/paraglide/**", "**/.svelte-kit/**"]
```

This feature addresses issue #10970 where code generators that write files within the watch directory would trigger continuous rebuilds.