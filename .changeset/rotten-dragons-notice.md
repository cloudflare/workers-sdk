---
"wrangler": patch
---

Always log when delegating to local `wrangler` install.

When a global `wrangler` command is executed in a package directory with `wrangler` installed locally, the command is redirected to the local `wrangler` install.
We now always log a message when this happens, so you know what's going on.
