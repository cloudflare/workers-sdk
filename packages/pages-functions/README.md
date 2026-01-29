# @cloudflare/pages-functions

Compile a Pages project's functions directory into a deployable worker entrypoint.

## Installation

```bash
npm install @cloudflare/pages-functions
```

## CLI Usage

```bash
# Compile the current project (looks for ./functions)
pages-functions

# Compile a specific project
pages-functions ./my-project

# Custom output location
pages-functions -o worker.js

# See all options
pages-functions --help
```

### CLI Options

```
Usage: pages-functions [options] [project-dir]

Arguments:
  project-dir              Path to the project root (default: ".")

Options:
  -o, --outfile <path>     Output file for the worker entrypoint (default: "dist/worker.js")
  --routes-json <path>     Output path for _routes.json (default: "_routes.json")
  --no-routes-json         Don't generate _routes.json
  --base-url <url>         Base URL for routes (default: "/")
  --fallback-service <name> Fallback service binding name (default: "ASSETS")
  -h, --help               Show this help message
```

## Programmatic API

```typescript
import * as fs from "node:fs/promises";
import { compileFunctions } from "@cloudflare/pages-functions";

const result = await compileFunctions(".", {
	fallbackService: "ASSETS",
});

// Write the generated worker entrypoint
await fs.writeFile("dist/worker.js", result.code);

// Write _routes.json for Pages deployment
await fs.writeFile(
	"_routes.json",
	JSON.stringify(result.routesJson, null, "\t")
);
```

### `compileFunctions(projectDirectory, options?)`

Compiles a Pages project's functions directory into a worker entrypoint.

#### Parameters

- `projectDirectory` (string): Path to the project root (containing the `functions` directory)
- `options` (object, optional):
  - `baseURL` (string): Base URL prefix for all routes. Default: `"/"`
  - `fallbackService` (string): Fallback service binding name. Default: `"ASSETS"`

#### Returns

A `Promise<CompileResult>` with:

- `code` (string): Generated JavaScript worker entrypoint
- `routes` (RouteConfig[]): Parsed route configuration
- `routesJson` (RoutesJSONSpec): `_routes.json` content for Pages deployment

## Project Structure

Your project should have a `functions` directory with file-based routing:

```
my-project/
├── functions/
│   ├── index.ts              # Handles /
│   ├── _middleware.ts        # Middleware for all routes
│   └── api/
│       ├── index.ts          # Handles /api
│       ├── [id].ts           # Handles /api/:id
│       └── [[catchall]].ts   # Handles /api/*
├── wrangler.jsonc
└── package.json
```

### Route Parameters

- `[param]` - Dynamic parameter (e.g., `[id].ts` → `/api/:id`)
- `[[catchall]]` - Catch-all parameter (e.g., `[[path]].ts` → `/api/:path*`)

### Handler Exports

Export handlers from your function files:

```typescript
// Handle all methods
export const onRequest = (context) => new Response("Hello");

// Handle specific methods
export const onRequestGet = (context) => new Response("GET");
export const onRequestPost = (context) => new Response("POST");
```

### Middleware

Create a `_middleware.ts` file to run code before your handlers:

```typescript
export const onRequest = async (context) => {
	const response = await context.next();
	response.headers.set("X-Custom-Header", "value");
	return response;
};
```

## Generated Output

The generated code:

1. Imports all function handlers from the functions directory
2. Creates a route configuration array
3. Includes the Pages Functions runtime (route matching, middleware execution)
4. Exports a default handler that routes requests

The output imports `path-to-regexp` for route matching. You need to install it in your project:

```bash
npm install path-to-regexp
```

## License

MIT OR Apache-2.0
