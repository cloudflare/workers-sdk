---
"wrangler": patch
---

Throw actionable error when autoconfig is run in the root of a workspace

When running Wrangler commands that trigger auto-configuration (like `wrangler dev` or `wrangler deploy`) in the root directory of a monorepo workspace, a helpful error is now shown directing users to run the command in a specific project's directory instead.
