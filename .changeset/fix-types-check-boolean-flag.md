---
"wrangler": patch
---

`wrangler types --check` no longer throws when the types file was generated with an explicit boolean flag. Previously, yargs would parse such flags as actual booleans rather than strings, causing an internal parse error.
