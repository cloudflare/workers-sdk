---
"wrangler": patch
---

Delegate to a local install of `wrangler` if one exists.

Users will frequently install `wrangler` globally to run commands like `wrangler init`, but we also recommend pinning a specific version of `wrangler` in a project's `package.json`. Now, when a user invokes a global install of `wrangler`, we'll check to see if they also have a local installation. If they do, we'll delegate to that version.

This requires that we define a `main` (maybe `module` would work too?) field in `package.json` so that `require.resolve` can find `"wrangler"`, but it's something of an implementation detail.
