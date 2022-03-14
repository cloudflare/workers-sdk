---
"wrangler": patch
---

refactor: initialize the user auth state synchronously

We can now initialize the user state synchronously, which means that
we can remove the checks for whether it has been done or not in each
of the user auth functions.
