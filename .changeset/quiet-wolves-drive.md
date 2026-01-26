---
"wrangler": patch
---

Fall back to global wrangler config directory for caching when no node_modules folder exists

Previously, when running wrangler via `npx` or in a directory without a `node_modules` folder, user configuration like the selected account would not be cached. This meant users had to re-select their account on every command.

Now, when no `node_modules` folder is found, the cache falls back to the global wrangler config directory (typically `~/.wrangler/cache`), ensuring configuration is persisted across commands.
