---
"wrangler": patch
---

fix: prevent `wrangler secret bulk` from hanging when no file is provided

Previously, running `wrangler secret bulk`, `wrangler versions secret bulk`, or `wrangler pages secret bulk` without a file argument would cause the command to hang indefinitely while waiting for stdin input. Now, when running interactively without a file, the command displays a helpful error message with usage examples instead of hanging silently.
