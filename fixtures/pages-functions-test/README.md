# Pages Functions Test Fixture

Test fixture for `@cloudflare/pages-functions` package.

## Usage

From the workers-sdk root:

```bash
# Build the pages-functions package first
pnpm --filter @cloudflare/pages-functions build

# Install deps for this fixture
pnpm --filter pages-functions-test install

# Compile functions -> worker, then bundle, then run dev
pnpm --filter pages-functions-test dev
```

## What it does

1. `build.mjs` uses `compileFunctions()` to compile `functions/` into `dist/worker.js`
2. esbuild bundles `dist/worker.js` (with path-to-regexp) into `dist/bundled.js`
3. wrangler runs the bundled worker

## Test endpoints

- `GET /` - Index route
- `GET /api/hello` - Static API route
- `POST /api/hello` - POST handler
- `GET /api/:id` - Dynamic route
- `PUT /api/:id` - Update handler
- `DELETE /api/:id` - Delete handler

All routes go through the root middleware which adds `X-Middleware: active` header.
