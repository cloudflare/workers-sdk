---
"@cloudflare/autoconfig": minor
---

Detect cf applications inside package-manager workspaces without requiring an application-local lockfile.

Use the enclosing workspace's package manager while keeping framework commands, output directories, and package.json updates local to the application. Wrangler's detection and command behavior are unchanged.

This changes the pre-1.0 cf integration contract: framework commands are returned without package-manager prefixes for all cf projects, including standalone applications. Before upgrading, cf consumers must resolve executables from the application's and ancestor directories' `node_modules/.bin` for build, dev, and the autoconfig `runCommand` callback. Older cf runners without local executable resolution must be updated first.
