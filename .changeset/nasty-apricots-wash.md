---
"wrangler": patch
---

fix: pages dev process exit when proxied process exits

Currently, if the process pages dev is proxying exists or crashes, pages dev does not clean it up, and attempts to continue proxying requests to it, resulting in it throwing 502 errors. This fixes that behaviour to make wrangler exit with the code the child_process exits with.
