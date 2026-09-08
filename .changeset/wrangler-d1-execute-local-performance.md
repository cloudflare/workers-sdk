---
"wrangler": patch
---

Fix `wrangler d1 execute --local` being extremely slow with large SQL files or commands

The local SQL splitter consumed quoted strings and comments character-by-character, re-checking the full accumulated string each time. This made splitting a large quoted value or comment quadratic, so seed files could take tens of seconds to run. The splitter now only inspects a bounded trailing window on each step, making splitting effectively linear. The remote path is unaffected as it imports the file server-side.
