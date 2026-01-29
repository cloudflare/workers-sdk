---
"wrangler": patch
---

Fix `wrangler init` failing with Yarn Classic

When using Yarn Classic (v1.x), running `wrangler init` or `wrangler init --from-dash` would fail because Yarn Classic doesn't properly handle version specifiers with special characters like `^` in `yarn create` commands. Yarn would install the package correctly but then fail to find the binary because it would look for a path like `.yarn/bin/create-cloudflare@^2.5.0` instead of `.yarn/bin/create-cloudflare`.

This fix strips version specifiers from the C3 command when using Yarn, allowing Yarn to install and run the latest compatible version of create-cloudflare.
