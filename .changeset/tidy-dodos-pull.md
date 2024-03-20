---
"wrangler": patch
---

chore: Deprecate `-- <command>`, `--proxy` and `--script-path` options from `wrangler pages dev`.

Build your application to a directory and run the `wrangler pages dev <directory>` instead. This results in a more faithful emulation of production behavior.
