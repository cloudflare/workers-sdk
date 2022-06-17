---
"wrangler": patch
---

fix: do not consider ancestor files when initializing a project with a specified name

When initializing a new project (via `wrangler init`) we attempt to reuse files in the current
directory, or in an ancestor directory. In particular we look up the directory tree for
package.json and tsconfig.json and use those instead of creating new ones.

Now we only do this if you do not specify a name for the new Worker. If you do specify a name,
we now only consider files in the directory where the Worker will be initialized.

Fixes #859
