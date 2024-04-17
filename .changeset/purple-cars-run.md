---
"wrangler": patch
---

fix: correctly handle non-text based files for kv put

The current version of the kv:key put command with the --path argument will treat file contents as a string because it is not one of Blob or File when passed to the form helper library. We should turn it into a Blob so it's not mangling inputs.
