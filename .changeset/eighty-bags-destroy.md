---
"wrangler": patch
---

fix: support all git versions for `wrangler init`

If `git` does not support the `--initial-branch` argument then just fallback to the default initial branch name.

We tried to be more clever about this but there are two many weird corner cases with different git versions on different architectures.
Now we do our best, with recent versions of git, to ensure that the branch is called `main` but otherwise just make sure we don't crash.

Fixes #1228
