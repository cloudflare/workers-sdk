# Development helpers

Shared development integrations used by Wrangler and the Vitest plugin.

- This package is private and bundled into its consumers. Keep its build for the Vitest plugin, and include changesets for affected consumers when changing user-facing behavior.
- Import through the focused `/miniflare-options`, `/dev-vars` and `/pages-assets` entry points.
- Wrangler configuration compatibility belongs here so its removal does not require a breaking change to Miniflare's runtime API.
- Pass loggers explicitly. Never introduce a logger singleton or a context setter; different Vitest pools need independent logging and warning deduplication.
- Keep configuration normalization and shared asset validation in `workers-utils/config`; deployment transport remains in `deploy-helpers`.
- `src/pages-assets.ts` uses Workers globals through pages-shared. Check it separately with `tsconfig.pages-assets.json`, keep its Node-facing declaration in `src/pages-assets-types.ts`, and maintain the signature assertion in `type-tests/pages-assets.ts`.
- The installed Vitest plugin tests verify package bundling. Keep its new-config path free of eager legacy configuration and Pages helper loads.
