---
"wrangler": patch
---

Fix: Missing Worker name using `--from-dash`
Added the `--from-dash` name as a fallback when no name is provided in the `wrangler init` command.
Additionally added a checks to the `std.out` to ensure that the name is provided.

resolves #1853
