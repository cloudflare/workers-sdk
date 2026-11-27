---
"@cloudflare/workers-shared": patch
"@cloudflare/pages-shared": patch
"@cloudflare/vite-plugin": patch
"miniflare": patch
---

Apply the headers of every `_headers` block when the same path appears more than once

Previously, when a `_headers` file had more than one block for the same path, local development only applied the last block's headers. Local development now merges the blocks like Workers Static Assets does in production: repeated header names are combined in file order, and `!` unsets are applied before all assignments for that path, even when the unset appears in a later block.
