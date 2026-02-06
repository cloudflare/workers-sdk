# Local explorer UI

This package contains the UI for the local dev data explorer.
The built output will be bundled into Miniflare and served by Miniflare at `/cdn-cgi/explorer`.

# API

This fetches data from an API running in Miniflare at`/cdn-cgi/explorer/api`.

The API client is generated from the OpenAPI spec in `packages/miniflare/src/workers/local-explorer/openapi.local.json`.

## API Type Generation

The API client code is auto-generated from the OpenAPI spec using [`@hey-api/openapi-ts`](https://heyapi.dev/).

**Configuration:** `openapi-ts.config.ts`

**Input:** `packages/miniflare/src/workers/local-explorer/openapi.local.json`

**Output:** `src/api/generated/`

The generated code includes:

- TypeScript types for all API request/response schemas
- A type-safe SDK client for making API calls

### When does generation run?

| Command        | Behavior                                               |
| -------------- | ------------------------------------------------------ |
| `pnpm install` | Runs `openapi-ts` in `postinstall` to generate types   |
| `pnpm build`   | Runs `openapi-ts` before building                      |
| `pnpm dev`     | Watches for spec changes and regenerates automatically |
| `pnpm dev:ui`  | Same as `dev` - watches for spec changes               |

In development, the `openapi-ts --watch` process runs concurrently with Vite, automatically regenerating the client when the OpenAPI spec changes.

# Developing

`pnpm run dev` in this directory.

Or to run a specific worker against the UI:

1. Run a worker (`fixtures/worker-with-resources`) using Wrangler or Vite, making sure it is running at `localhost:8787`.
2. Run this package with `pnpm run dev:ui`, which will spin up a dev server for just the UI using Vite.
