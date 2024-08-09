# internal-module-resolution

This simple fixture checks that the Vitest integration import resolution works correctly when a CommonJS packages has a require to a directory rather than a specific file.

There is no Worker defined here but we still need a minimal wrangler.toml that we can pass to the vitest-pool-workers plugin to trigger that plugin to handle import resolution and file loading.
