# Cloudflare Vite plugin v1 maintenance

This branch maintains @cloudflare/vite-plugin v1. Development of the current Workers SDK continues on [main](https://github.com/cloudflare/workers-sdk).

The workspace contains the [Vite plugin](packages/vite-plugin-cloudflare), its private support packages, playgrounds, E2E fixtures, and two root integration fixtures, dev-registry and create-test-harness-example, plus their private shared helper package. Private package dependencies retain workspace:* references, including the shared TypeScript configurations. Public SDK dependencies use exact published npm versions.

Install with pnpm install using the versions in package.json. Run pnpm build to build the plugin and its private dependencies, pnpm test:ci for unit tests, and pnpm check for validation, lint, types, and formatting. Additional test commands are pnpm test:fixtures, pnpm test:playgrounds, and pnpm test:e2e.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the maintenance workflow and [the plugin README](packages/vite-plugin-cloudflare/README.md) for usage.
