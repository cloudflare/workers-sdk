# pages-functions-build-cli

Smoke-test fixture for the `@cloudflare/pages-functions` CLI (`packages/pages-functions`).

This fixture exists purely to exercise the `pages-functions` command-line interface end-to-end:

1. `pnpm build` runs the CLI against `./functions`
2. The CLI emits `dist/worker.js` and `_routes.json`
3. `pnpm dev` additionally starts `wrangler dev` against the generated worker

For a full Pages-project fixture (used to test the legacy `wrangler pages dev` flow inside wrangler itself) see [`fixtures/pages-functions-app`](../pages-functions-app/).
