---
"@cloudflare/workers-shared": patch
---

Fix `_headers` rules dropping the headers of earlier blocks for the same path

When a path appeared in more than one block of a `_headers` file, only the last block was applied and the headers from the earlier blocks were silently dropped. The headers and unset directives of every block for the same path are now combined, so all of the rules take effect.
