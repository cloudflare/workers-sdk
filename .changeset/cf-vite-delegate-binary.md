---
"@cloudflare/vite-plugin": minor
---

Add `cf-vite` delegate binary with a `dev` subcommand

The plugin now ships a small subcommand-based CLI (`bin/cf-vite`) that any parent process can spawn to drive the plugin as a long-running dev-server subprocess. The protocol is `<pkgRoot>/bin/cf-vite <verb> [argv]` with stdio inherited and SIGINT/SIGTERM forwarded. Today the only verb is `dev`, which boots Vite with the user's `vite.config.ts` (expected to include `cloudflare()`). Unknown or missing verbs exit non-zero with a descriptive error.
