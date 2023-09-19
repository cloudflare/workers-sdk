---
"wrangler": minor
---

feat: add support for breakpoint debugging to `wrangler dev`'s `--remote` and `--no-bundle` modes

Previously, breakpoint debugging using Wrangler's DevTools was only supported
in local mode, when using Wrangler's built-in bundler. This change extends that
to remote development, and `--no-bundle`.

When using `--remote` and `--no-bundle` together, uncaught errors will now be
source-mapped when logged too.
