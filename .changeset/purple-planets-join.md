---
"wrangler": patch
---

Expose `wrangler pages functions build` command, which takes the `functions` folder and compiles it into a single Worker.

This was already done in `wrangler pages dev`, so this change just exposes this build command for use in our build image, or for people who want to do it themselves.
