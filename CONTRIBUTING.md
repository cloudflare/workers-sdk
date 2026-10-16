# Contributing to Vite plugin v1

Target vite-plugin-v1 for compatible plugin fixes. Changes to public SDK packages belong on main; consume their published releases by updating exact npm dependency versions here. Private support packages remain in this branch and use workspace:* references.

Use the Node.js and pnpm versions in package.json, then run pnpm install. The root build script builds the plugin and its private dependencies. Playgrounds and the two retained integration fixtures exercise the local plugin, while Wrangler comes from npm.

Before opening a PR, run pnpm build, pnpm test:ci, and pnpm check. Run relevant fixture, playground, or E2E suites when those integrations are affected. Browser suites need Chromium; install it with pnpm --filter @vite-plugin-cloudflare/playground playwright:install. Remote-binding E2E tests also require Cloudflare credentials and otherwise skip themselves.

Format with pnpm prettify, add a changeset when required by .changeset/README.md, and use .github/PULL_REQUEST_TEMPLATE.md. Keep v2-specific behavior on main.

The release workflow runs on vite-plugin-v1, creates a Changesets version PR for this branch, and publishes only @cloudflare/vite-plugin under the v1 npm dist-tag. Preview PR builds use pkg.pr.new and exclude private packages. Release builds skip shared caches and disable package source maps; application source maps are unchanged.
