---
"wrangler": patch
---

Fall back to project-level `.wrangler/cache` for caching when no `node_modules` folder exists

Previously, when running wrangler via `npx` or in a directory without a `node_modules` folder, user configuration like the selected account would not be cached. This meant users had to re-select their account on every command.

Now, when no `node_modules` folder is found, the cache falls back to the project-level `.wrangler/cache` folder, ensuring configuration is persisted across commands while keeping the cache project-specific.
