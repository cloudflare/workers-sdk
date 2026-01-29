# Local explorer UI

This package contains the UI for the local dev data explorer.
The built output will be bundled into Miniflare and served by Miniflare at `/cdn-cgi/explorer`.

# API

This fetches data from an API running in Miniflare at`/cdn-cgi/explorer/api`.

The API client is generated from the OpenAPI spec in `packages/miniflare/src/workers/local-explorer/openapi.local.json`.

# Developing

`pnpm run dev` in this directory.

Or to run a specific worker against the UI:

1. Run a worker (`fixtures/worker-with-resources`) using Wrangler or Vite, making sure it is running at `localhost:8787`.
2. Run this package with `pnpm run dev`, which will spin up a dev server using vite.
