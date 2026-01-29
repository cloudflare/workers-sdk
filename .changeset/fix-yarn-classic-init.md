---
"wrangler": patch
---

Fix `wrangler init` failing with Yarn Classic

When using Yarn Classic (v1.x), running `wrangler init` or `wrangler init --from-dash` would fail because Yarn Classic doesn't properly handle version specifiers with special characters like `^` in `yarn create` commands. Yarn would install the package correctly but then fail to find the binary because it would look for a path like `.yarn/bin/create-cloudflare@^2.5.0` instead of `.yarn/bin/create-cloudflare`.

This fix removes the version specifier from the default C3 command entirely. Since C3 has had auto-update behavior for over two years, specifying a version is no longer necessary and removing it resolves the Yarn Classic compatibility issue.
