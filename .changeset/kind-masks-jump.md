---
"wrangler": patch
---

fix: Improve port selection for `wrangler dev` for both worker ports and inspector ports.

Previously when running `wrangler dev` on multiple workers at the same time, you couldn't attach DevTools to both workers, since they were both listening on port 9229.
With this PR, that behavior is improved -- you can now pass an `--inspector-port` flag to specify a port for DevTools to connect to on a per-worker basis, or
if the option is omitted, wrangler will assign a random unused port for you.

This "if no option is given, assign a random unused port" behavior has also been added to `wrangler dev --port`, so running `wrangler dev` on two
workers at once should now "just work". Hopefully.
