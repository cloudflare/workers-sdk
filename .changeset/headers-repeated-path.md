---
"@cloudflare/workers-shared": patch
"@cloudflare/pages-shared": patch
"@cloudflare/vite-plugin": patch
"miniflare": patch
---

Apply the headers of every `_headers` block when the same path appears more than once

Previously, when a `_headers` file had more than one block for the same path, only the last block's headers were applied and the earlier blocks' headers were silently dropped. The blocks are now merged, so a matching request gets the headers from all of them, with a header name repeated across blocks combined just as it is within a single block. A `!` unset in a later block still removes a header that an earlier block for the same path set.
