---
"wrangler": patch
---

fix: use the appropriate package manager when initializing a wrangler project

Previously, when we initialized a project using `wrangler init`, we always used npm as the package manager.

Now we check to see whether npm and yarn are actually installed, and also whether there is already a lock file in place before choosing which package manager to use.

Fixes #353
