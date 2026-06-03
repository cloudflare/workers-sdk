---
"wrangler": minor
---

Generalize `wrangler deploy` and `wrangler versions upload` positional argument from `[script]` to `[path]`

Both `wrangler deploy` and `wrangler versions upload` now accept a generic `[path]` positional argument that can point to either a Worker entry-point file or a directory of static assets. The type is auto-detected. For example:

- **File**: `wrangler deploy ./src/index.ts` deploys a Worker (same as before)
- **Directory**: `wrangler deploy ./public` deploys a static assets site (no interactive confirmation prompt)

The `--script` named option is now hidden and deprecated for both commands. It continues to work for backwards compatibility but only accepts file paths. Passing a directory to `--script` now produces a clear error message suggesting the positional `path` argument or `--assets` flag instead.
