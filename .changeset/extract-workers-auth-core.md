---
"@cloudflare/workers-auth": minor
"@cloudflare/workers-utils": minor
---

Extract the Cloudflare CLI auth layer into a product-agnostic `@cloudflare/workers-auth` core

The OAuth login/logout/refresh, credential storage, config cache, and account-selection machinery is now shared behind an `AuthProduct` descriptor, with a thin per-CLI entrypoint on top. `@cloudflare/workers-auth/wrangler` (`createWranglerAuth`) preserves wrangler's existing behaviour, and a new `@cloudflare/workers-auth/cf` (`createCfAuth`) adds the `cf` CLI: its own OAuth app registration (client id, callback port, branded consent pages, scoped-token-only auth), a dedicated scope catalog, JSON config files under `~/.config/cloudflare`, and an isolated config-cache namespace so `cf` login/logout never purges wrangler's cache.

As part of the extraction, `@cloudflare/workers-utils` now exports the shared `createConfigCache` (with a `namespace` option), `openInBrowser`, and the `isInteractive` / `isNonInteractiveOrCI` / `isCI` TTY-and-CI detection helpers (each taking the caller's logger as a parameter rather than relying on a singleton). These read a bundled `ci-info`, so consumers that need to fake CI in their tests should mock this package's helpers rather than `ci-info` directly.
