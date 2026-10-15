# AGENTS.md

This is the maintenance branch for Cloudflare Vite plugin v1. Read packages/vite-plugin-cloudflare/AGENTS.md before changing the plugin.

- Use pnpm and the Node.js/pnpm versions declared in package.json. Run commands from the workspace root and install with pnpm install.
- The plugin is the only published product maintained here. Retain its private workspace dependencies: remote-bindings, workers-shared, mock-npm-registry, workers-tsconfig, and lint-config-shared. Keep private dependencies as workspace:* references.
- Public SDK packages come from npm at exact deployed versions. Backport their fixes by bumping those dependencies instead of restoring public sibling packages.
- Keep the plugin playgrounds, the dev-registry and create-test-harness-example integration fixtures, and their private fixtures/shared helper package. Their workspace references to the local plugin are intentional.
- Shared TypeScript configurations remain in packages/workers-tsconfig. Custom lint rules remain in packages/lint-config-shared.
- Keep TypeScript strictly typed, use type-only imports and node: built-in imports, and explain lint suppressions with a reason after --. Prefer named function declarations and useful JSDoc for public helpers.
- Use Vitest test-context expect. Prefer real files and temporary directories; do not edit generated files directly.
- Run pnpm build, pnpm test:ci, and pnpm check. Run pnpm test:fixtures for retained root fixtures, pnpm test:playgrounds for browser coverage, and pnpm test:e2e for package-manager coverage. Credentialed tests require explicit environment support.
- Format with pnpm prettify. Read .changeset/README.md and add plugin changesets for user-facing changes. Work on a branch and target vite-plugin-v1 in pull requests, using .github/PULL_REQUEST_TEMPLATE.md and the [vite-plugin] title prefix.
- Workflows build, test, preview-publish, and release the plugin and required private support packages. Publish only the plugin. Stable maintenance releases use the npm v1 dist-tag to preserve main's latest tag.
