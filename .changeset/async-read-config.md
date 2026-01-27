---
"wrangler": minor
"@cloudflare/workers-utils": minor
---

Add new async config reading APIs to support future code-based config files.

- `unstable_readConfigAsync` - Async version of `unstable_readConfig` that will support code-based config files (`.ts`, `.js`)
- `experimental_readRawConfigAsync` - Async version of `experimental_readRawConfig`

The existing sync APIs (`unstable_readConfig`, `experimental_readRawConfig`) continue to work unchanged for data file formats (`.toml`, `.json`, `.jsonc`).

In Wrangler v5, the sync APIs will be removed and the async APIs will become the default.
