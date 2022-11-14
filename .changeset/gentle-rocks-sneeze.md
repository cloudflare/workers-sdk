---
"wrangler": patch
---

Use the user's preferred default branch name if set in .gitconfig.

Previously, we would initialize new workers with `main` as the name of the default branch.
Now, we see if the user has a custom setting in .gitconfig for `init.defaultBranch`, and use
that if it exists.

Closes #2112
