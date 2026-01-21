# @cloudflare/pages-functions

Compile a Pages functions directory into a deployable worker entrypoint.

## Installation

```bash
npm install @cloudflare/pages-functions
```

## Usage

```typescript
import * as fs from "node:fs/promises";
import { compileFunctions } from "@cloudflare/pages-functions";

const result = await compileFunctions("./functions", {
	fallbackService: "ASSETS",
});

// Write the generated worker entrypoint
await fs.writeFile("worker.js", result.code);

// Write _routes.json for Pages deployment
await fs.writeFile("_routes.json", JSON.stringify(result.routesJson, null, 2));
```

## API

### `compileFunctions(functionsDirectory, options?)`

Compiles a Pages functions directory into a worker entrypoint.

#### Parameters

- `functionsDirectory` (string): Path to the functions directory
- `options` (object, optional):
  - `baseURL` (string): Base URL prefix for all routes. Default: `"/"`
  - `fallbackService` (string): Fallback service binding name. Default: `"ASSETS"`

#### Returns

A `Promise<CompileResult>` with:

- `code` (string): Generated JavaScript worker entrypoint
- `routes` (RouteConfig[]): Parsed route configuration
- `routesJson` (RoutesJSONSpec): `_routes.json` content for Pages deployment

## Functions Directory Structure

The functions directory uses file-based routing:

```
functions/
├── index.ts              # Handles /
├── _middleware.ts        # Middleware for all routes
├── api/
│   ├── index.ts          # Handles /api
│   ├── [id].ts           # Handles /api/:id
│   └── [[catchall]].ts   # Handles /api/*
```

### Route Parameters

- `[param]` - Dynamic parameter (e.g., `[id].ts` → `/api/:id`)
- `[[catchall]]` - Catch-all parameter (e.g., `[[path]].ts` → `/api/:path*`)

### Exports

Export handlers from your function files:

```typescript
// Handle all methods
export const onRequest = (context) => new Response("Hello");

// Handle specific methods
export const onRequestGet = (context) => new Response("GET");
export const onRequestPost = (context) => new Response("POST");
```

## Generated Output

The generated code:

1. Imports all function handlers
2. Creates a route configuration array
3. Includes the Pages Functions runtime (inlined)
4. Exports a default handler that routes requests

The output requires `path-to-regexp` as a runtime dependency (resolved during bundling).

## License

MIT OR Apache-2.0
