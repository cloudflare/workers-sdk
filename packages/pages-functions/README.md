# `@cloudflare/pages-functions`

`@cloudflare/pages-functions` compiles a [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/) `functions/` directory into a single [Cloudflare Worker](https://developers.cloudflare.com/workers/) bundle. It provides both a command-line interface and a programmatic API for build tools.

The package discovers file-based routes, bundles their handlers into an ES module Worker, collects imported Wasm, text, and binary modules, and returns Pages routing metadata through its programmatic API.

> [!WARNING]
> Pages Functions are not recommended for new development. Build new applications and new server-side functionality with Workers instead. This package is intended to support existing Pages Functions projects and help migrate them incrementally to Workers.

## Installation

Install the package as a development dependency:

```sh
npm install --save-dev @cloudflare/pages-functions
```

## CLI

Compile the default `functions/` directory into `dist/`:

```sh
npx @cloudflare/pages-functions build
```

To specify the input and output directories:

```sh
npx @cloudflare/pages-functions build ./functions --outdir ./dist/worker
```

The command writes the following files:

- `index.js`: the compiled ES module Worker
- `index.js.map`: the source map, when `--sourcemap` is used
- Imported Wasm, text, binary, and `assets:` modules required by the Worker

The generated Worker contains its own router and does not require a `_routes.json` file. To produce one (for example when deploying to Pages), pass `--routes-output <path>`. Pages deployment tools such as Wrangler generate this file on their own and do not need it from the CLI.

The command only builds the Worker. It does not deploy it or create deployment configuration. By default, the generated Worker falls back to `env.ASSETS.fetch()` when no Function route handles a request, so the deployment must provide an `ASSETS` binding or select another binding with `--fallback-service`.

Runtime-native imports such as `node:*` and `cloudflare:*` are not automatically excluded from the bundle. Pass them through with repeatable `--external` options when the surrounding Worker build or runtime provides them:

```sh
npx @cloudflare/pages-functions build --external "node:*" --external "cloudflare:*"
```

### CLI options

| Option                      | Description                                            | Default     |
| --------------------------- | ------------------------------------------------------ | ----------- |
| `[directory]`               | Pages Functions directory                              | `functions` |
| `--outdir <path>`           | Output directory                                       | `dist`      |
| `--minify`                  | Minify the Worker bundle                               | Disabled    |
| `--sourcemap`               | Generate an external source map                        | Disabled    |
| `--fallback-service <name>` | Fetcher binding used when no route handles the request | `ASSETS`    |
| `--external <module>`       | Exclude a module from the bundle; may be repeated      | None        |
| `--routes-output <path>`    | Write the generated `_routes.json` spec to this path   | Not written |
| `-h`, `--help`              | Display usage information                              |             |
| `-v`, `--version`           | Display the package version                            |             |

## Programmatic API

Use `buildPagesFunctions()` when integrating the compiler into another build tool:

```ts
import { buildPagesFunctions } from "@cloudflare/pages-functions";

const result = await buildPagesFunctions({
	functionsDirectory: "./functions",
	outputDirectory: "./dist/worker",
	sourcemap: true,
});

console.log(result.entryPointPath);
console.log(result.routesJSON);
```

`buildPagesFunctions()` returns the generated routing specification as `routesJSON` but does not write a `_routes.json` file. Consumers such as Wrangler can use this metadata when deploying to Pages.

### Build options

| Option                  | Type       | Description                                               | Default           |
| ----------------------- | ---------- | --------------------------------------------------------- | ----------------- |
| `functionsDirectory`    | `string`   | Pages Functions directory to compile                      | Required          |
| `outputDirectory`       | `string`   | Directory for `index.js` and collected modules            | Required          |
| `assetsOutputDirectory` | `string`   | Directory for files referenced by `assets:` imports       | `outputDirectory` |
| `fallbackService`       | `string`   | Fetcher binding used when no route handles the request    | `ASSETS`          |
| `minify`                | `boolean`  | Minify the Worker bundle                                  | `false`           |
| `sourcemap`             | `boolean`  | Generate an external source map                           | `false`           |
| `external`              | `string[]` | Module specifiers to exclude from the bundle              | `undefined`       |
| `routesDescription`     | `string`   | Description included in the returned routes specification | `undefined`       |
| `metafile`              | `boolean`  | Include the esbuild metafile in the result                | `false`           |

### Build result

`buildPagesFunctions()` returns:

| Property                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `entryPointPath`        | Absolute path to the generated `index.js`             |
| `bundleType`            | Always `"esm"`                                        |
| `modules`               | Collected Wasm, text, and binary modules              |
| `dependencies`          | Inputs included in the generated bundle               |
| `sourceMapPath`         | Absolute source map path when source maps are enabled |
| `routesJSON`            | Generated `_routes.json` data                         |
| `filepathRoutingConfig` | Discovered Pages Functions routes and base URL        |
| `metafile`              | esbuild metafile when requested                       |

The package also exports lower-level route discovery, generation, optimization, and validation helpers for tooling authors. Their TypeScript declarations are included with the package.

## Migrate to Workers

[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) supports deploying front-end assets and Worker code together. Workers also provides access to more Cloudflare platform features than Pages Functions. New routes and application logic should therefore be written in a Worker rather than added to an existing `functions/` directory.

For an existing Pages Functions project, you can compile the old Functions during the Worker build and delegate requests to them from your Worker. This lets you migrate one route at a time.

For example, configure Wrangler to compile the legacy `functions/` directory before it bundles the Worker:

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": "my-worker",
	"main": "./src/index.js",
	// Preserve the compatibility date and flags from your Pages project.
	"compatibility_date": "<YOUR_EXISTING_COMPATIBILITY_DATE>",
	"assets": {
		"directory": "./dist/client",
		"binding": "ASSETS",
		"run_worker_first": true,
	},
	"build": {
		"command": "npx @cloudflare/pages-functions build ./functions --outdir ./dist/pages-functions --external \"node:*\" --external \"cloudflare:*\"",
		"watch_dir": ["./functions", "./src"],
	},
}
```

Adjust `assets.directory` and combine the build command with your existing front-end build command as needed. Preserve any compatibility flags used by the Pages project. The `--external` options leave runtime-native imports for Wrangler to process. The `ASSETS` binding is required by the compiler's default fallback behavior. `run_worker_first` ensures the Worker can run Pages Functions routes and middleware before falling back to static assets.

Import the compiled handler from your Worker, handle new or migrated routes first, and use the old Pages Functions handler as a fallback:

```js
import legacyPagesFunctions from "../dist/pages-functions/index.js";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/api/new-route") {
			return new Response("Handled by the Worker");
		}

		return legacyPagesFunctions.fetch(request, env, ctx);
	},
};
```

This ordering means Pages Functions middleware does not run for routes handled directly by the Worker. Migrate authentication, authorization, logging, and other applicable middleware to the Worker before moving routes that depend on it.

As routes are migrated, remove their files from `functions/` and implement them directly in the Worker. Once no legacy Pages Functions remain, remove the compiler build step and import.

If the legacy Functions use `assets:` imports, the imported assets must be written into the directory configured by `assets.directory`. The CLI writes them beneath its output directory, so use the programmatic API to select separate Worker and asset outputs:

```js
// scripts/build-pages-functions.mjs
import { buildPagesFunctions } from "@cloudflare/pages-functions";

await buildPagesFunctions({
	functionsDirectory: "./functions",
	outputDirectory: "./dist/pages-functions",
	assetsOutputDirectory: "./dist/client",
	external: ["node:*", "cloudflare:*"],
});
```

Then set `build.command` to `node ./scripts/build-pages-functions.mjs`. The `assets:` integration always uses the `ASSETS` binding, even when a different general fallback service is configured.

Workers do not use Pages `_routes.json` metadata. Configure [Workers Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/) explicitly, especially if the Pages project used custom `_routes.json` rules or middleware. See the complete [Pages-to-Workers migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) for bindings, assets, compatibility settings, and deployment changes.

## Contributing

See the Workers SDK [contributing guide](../../CONTRIBUTING.md) for repository setup and contribution requirements.

From the repository root, install dependencies and run package tasks with:

```sh
pnpm install
pnpm run build --filter @cloudflare/pages-functions
pnpm run check:type --filter @cloudflare/pages-functions
pnpm run test:ci --filter @cloudflare/pages-functions
pnpm run dev --filter @cloudflare/pages-functions
```

The `dev` task watches this package's implementation; it does not watch an end-user Pages Functions project.

Before submitting changes, run:

```sh
pnpm prettify
pnpm check
```

## License

Licensed under either the [Apache 2.0 license](../../LICENSE-APACHE) or the [MIT license](../../LICENSE-MIT) at your option.
