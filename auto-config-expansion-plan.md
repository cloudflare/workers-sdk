# Wrangler Auto-Config Expansion Plan

This note researches whether Wrangler's existing automatic configuration feature can grow from "detect supported web frameworks and configure Workers" into a broader "run `wrangler deploy` and Wrangler figures out what this project is" experience. It focuses on two near-term examples:

- Dockerfile projects that could be deployed as Cloudflare Containers.
- Express or Node HTTP server projects that could be deployed directly to Workers using Node.js HTTP server compatibility.

## Executive Summary

We can build this, but the current auto-config implementation is not yet shaped for it.

The current implementation is intentionally centered on frontend/full-stack JavaScript frameworks with asset output directories. It assumes every non-configured project has a `framework` and an `outputDir`, and it runs only for bare `wrangler deploy` or `wrangler setup`. That design worked for framework adapters, but it is too narrow for API-only Workers, Express apps, Hono apps, and Dockerfile-backed Containers.

The good news is that the lower-level technical pieces already exist:

- Wrangler deploy already knows how to build a configured local Dockerfile, push it, deploy the Worker, and roll out a Container application.
- Workers runtime already supports enough Node.js HTTP server APIs for Express-style apps through `nodejs_compat` and `cloudflare:node`'s `httpServerHandler`.
- The auto-config package already has a useful detect, prompt, dry-run, write config, install package, update scripts, and metrics loop.

The main missing layer is a more general "project adapter" abstraction that can represent multiple deployment target shapes, not just web frameworks with static/SSR output directories.

Recommended direction:

1. Refactor auto-config around `ProjectAdapter` or `ProjectRecipe` candidates, while preserving existing framework adapters as one adapter family.
2. Make `outputDir` optional and move compatibility flags, source file generation, dependencies, and warnings into adapter-owned plans.
3. Add custom detectors for explicit entrypoints, Node HTTP servers, and Dockerfiles alongside `@netlify/build-info` framework detection.
4. Ship Express/Node server auto-config first because it exercises the new no-asset, entrypoint-wrapper path without needing Containers product decisions.
5. Ship Dockerfile-to-Containers after product decisions about default scaling/routing, local Docker prerequisites, paid-plan messaging, and generated Worker shape.

## Source Material

Code inspected:

- `packages/wrangler/src/deploy/index.ts`
- `packages/wrangler/src/deploy/autoconfig.ts`
- `packages/wrangler/src/setup.ts`
- `packages/wrangler/src/autoconfig/index.ts`
- `packages/autoconfig/src/details/index.ts`
- `packages/autoconfig/src/details/framework-detection.ts`
- `packages/autoconfig/src/run.ts`
- `packages/autoconfig/src/types.ts`
- `packages/autoconfig/src/frameworks/*`
- `packages/wrangler/src/containers/*`
- `packages/workers-utils/src/config/validation.ts`
- Relevant Wrangler/autoconfig/container tests.

Docs and external sources reviewed:

- Cloudflare auto-config changelog: https://developers.cloudflare.com/changelog/post/2025-12-16-wrangler-autoconfig/
- Cloudflare auto-config GA changelog: https://developers.cloudflare.com/changelog/post/2026-02-25-wrangler-autoconfig-ga/
- Cloudflare automatic configuration docs: https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/
- Cloudflare Containers docs: https://developers.cloudflare.com/containers/
- Cloudflare Containers getting started: https://developers.cloudflare.com/containers/get-started/
- Cloudflare Container class docs: https://developers.cloudflare.com/containers/container-class/
- Wrangler Containers config docs: https://developers.cloudflare.com/workers/wrangler/configuration/#containers
- Workers Node HTTP docs: https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- Workers Node HTTPS docs: https://developers.cloudflare.com/workers/runtime-apis/nodejs/https/
- Express on Workers tutorial: https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/

## Current Auto-Config Implementation

### Entry Points

`wrangler deploy` has `--autoconfig` enabled by default in `packages/wrangler/src/deploy/index.ts:87-92`.

The deploy handler runs auto-config before missing deploy config prompts and before the normal build/deploy pipeline:

- `maybeRunAutoConfig(args, config)` at `packages/wrangler/src/deploy/index.ts:109-115`.
- `promptForMissingDeployConfig(args, config)` at `packages/wrangler/src/deploy/index.ts:117-118`.
- Normal `buildWorker()` and `deploy()` after config merge at `packages/wrangler/src/deploy/index.ts:132-152`.

`wrangler setup` is the same underlying auto-config flow without deployment:

- `setupCommand` is in `packages/wrangler/src/setup.ts:14-140`.
- It runs detection, then `runAutoConfigLogic()` if the project is not configured.
- It supports `--dry-run`, `--yes`, `--build`, and hidden install/completion toggles.

### When Auto-Config Runs

`maybeRunAutoConfig()` only runs for a bare deploy command:

```ts
const shouldRunAutoConfig =
	args.autoconfig &&
	!args.path &&
	!args.script &&
	!args.assets &&
	!args.config;
```

This is in `packages/wrangler/src/deploy/autoconfig.ts:80-88`.

That means auto-config currently does not run for:

- `wrangler deploy index.js`
- `wrangler deploy ./src/index.ts`
- `wrangler deploy ./dist`
- `wrangler deploy --assets ./dist`
- `wrangler deploy --config wrangler.jsonc`

Tests explicitly lock this behavior in:

- `packages/wrangler/src/__tests__/deploy/entry-points.test.ts:342-359` asserts no auto-config for `wrangler deploy <script>`.
- `packages/wrangler/src/__tests__/deploy/entry-points.test.ts:882-1033` asserts no auto-config for explicit asset directory flows.

This is the first important blocker for `wrangler deploy index.js` where `index.js` is an Express app. The product requirement would require a new explicit-target auto-config mode, not just a new framework adapter.

### Detection Model

Detection is in `@cloudflare/autoconfig`.

`getDetailsForAutoConfig()` in `packages/autoconfig/src/details/index.ts:89-185` returns project details. Its first branch treats any real non-Pages Wrangler config as already configured:

- `wranglerConfig.configPath` and not `pages_build_output_dir` returns `configured: true` at `packages/autoconfig/src/details/index.ts:105-118`.
- Auto-config does not mutate or repair already configured projects.

For unconfigured projects, detection calls `detectFramework()` in `packages/autoconfig/src/details/framework-detection.ts:45-141`.

`detectFramework()` uses `@netlify/build-info`:

- It creates a `Project` with `NodeFS`.
- It calls `project.getBuildSettings()`.
- It converts Netlify's package manager detection to Wrangler package manager objects.
- It handles workspace roots and Pages heuristics.
- It falls back to the synthetic `static` framework if no framework is found.

Multiple framework handling is in `maybeFindDetectedFramework()` at `packages/autoconfig/src/details/framework-detection.ts:270-338`:

- If there is one framework, use it.
- If there are multiple and only one is known, use that one.
- If there are exactly two and one is auxiliary `vite` or `hono`, discard the auxiliary one.
- In non-interactive/CI, ambiguous multiple frameworks error.
- Locally, it chooses a candidate because the user can confirm or change settings.

### Current Type Shape

`AutoConfigDetailsBase` is in `packages/autoconfig/src/types.ts:9-28`.

For non-configured projects it requires:

- `workerName`
- `projectPath`
- `configured`
- `framework`
- `outputDir`
- `packageManager`

The type-level requirement is reinforced at runtime:

- `getDetailsForAutoConfig()` derives `outputDir` from `detectedFramework.dist` or by scanning for a directory with `index.html` at `packages/autoconfig/src/details/index.ts:139-140`.
- If it cannot find one, it throws at `packages/autoconfig/src/details/index.ts:166-177`.
- `runAutoConfig()` asserts `outputDir` at `packages/autoconfig/src/run.ts:90-93`.
- `Framework.configure()` always receives `outputDir` per `packages/autoconfig/src/frameworks/framework-class.ts:92-100`.

This is the biggest architectural mismatch for Express, Hono, Fastify, raw Worker scripts, and Containers. These project types may not have an output directory at all.

### Current Framework Registry

Known frameworks live in `packages/autoconfig/src/frameworks/all-frameworks.ts:23-244`.

Supported in code today:

- Static
- Analog
- Angular
- Astro
- Next.js
- Nuxt
- Qwik
- React Router
- Solid Start
- SvelteKit
- TanStack Start
- Vite
- Vike
- Waku

Known but unsupported:

- Hono at `packages/autoconfig/src/frameworks/all-frameworks.ts:68-71`
- Cloudflare Pages
- Hydrogen

Unsupported frameworks become `NoOpFramework` via `packages/autoconfig/src/frameworks/index.ts:29-40`, then `runAutoConfig()` fails with "cannot be automatically configured" at `packages/autoconfig/src/run.ts:76-87`.

Hono being known but unsupported is a useful signal. The current system already knows API/server frameworks exist, but its output-directory assumption prevents straightforward support.

### Configuration/Application Model

`runAutoConfig()` in `packages/autoconfig/src/run.ts:46-251` does the main work:

- Display detected settings.
- Let users modify worker name, framework, output directory, and build command.
- Validate framework version.
- Create a base `wrangler.jsonc` with schema, name, today's compatibility date, and observability.
- Call `framework.configure()` in dry-run mode.
- Build an operation summary.
- Prompt to proceed.
- Install Wrangler if needed.
- Call `framework.configure()` again for real.
- Update `package.json` scripts.
- Write `wrangler.jsonc`.
- Update `.gitignore`.
- Write `.assetsignore` when necessary.
- Run the build command unless disabled.

Important details:

- `ensureNodejsCompatIsInConfig()` unconditionally adds `nodejs_compat` to generated config at `packages/autoconfig/src/run.ts:262-276`.
- `saveWranglerJsonc()` shallow-merges existing JSON/JSONC config into a new generated object and writes `wrangler.jsonc` with `JSON.stringify()` at `packages/autoconfig/src/run.ts:285-311`.
- `buildOperationsSummary()` assumes a required `outputDir` in the summary at `packages/autoconfig/src/run.ts:325-354`.
- Package scripts default to `build && wrangler deploy` if a build command exists, or `wrangler deploy` otherwise at `packages/autoconfig/src/run.ts:356-375`.
- `cf-typegen` is added only if `wranglerConfig.main` exists and TypeScript is used at `packages/autoconfig/src/run.ts:377-389`.

For broader project detection, these pieces are useful, but the summary and configuration plan need to become more flexible.

### Existing Minimal Deploy Config Prompt

There is a separate interactive path for explicit deploys in `promptForMissingDeployConfig()` at `packages/wrangler/src/deploy/autoconfig.ts:180-361`.

That path:

- Prompts for missing name and compatibility date.
- Optionally writes a simple `wrangler.jsonc`.
- Persists explicit `main`, `assets`, routes, triggers, vars, build flags, and similar deploy args.
- Does not run project detection.
- Does not install adapters or generate source files.

This is why explicit `wrangler deploy ./assets` can get a config file, while explicit `wrangler deploy index.js` cannot be adapted into an Express Worker today.

## Current Containers Support in Wrangler

Wrangler already has the low-level deployment path needed for Dockerfile-backed Containers.

### Deploy Pipeline Integration

`packages/wrangler/src/deploy/index.ts` imports:

- `buildContainer` from `../containers/build`
- `getNormalizedContainerOptions` from `../containers/config`
- `deployContainers` from `../containers/deploy`

These are passed into `deploy()` at `packages/wrangler/src/deploy/index.ts:143-152`.

In other words, once Wrangler has a config with `containers`, a Worker entrypoint, a Durable Object binding, and a migration, the deploy pipeline can already build and deploy the container.

### Config Normalization

`getNormalizedContainerOptions()` in `packages/wrangler/src/containers/config.ts:48-214`:

- Returns no containers when `config.containers` is empty.
- Verifies the container `class_name` matches a Durable Object class in the same Worker.
- Rejects Durable Object bindings that point at another Worker via `script_name`.
- Applies defaults such as `max_instances: 20` and default instance type `lite`.
- Converts Dockerfile paths into build inputs.
- Resolves remote image references for non-Dockerfile images.

`isDockerfile()` is exported from workers-utils and implemented at `packages/workers-utils/src/config/validation.ts:6505-6549`. It currently treats an existing file path as a Dockerfile path. If the path exists but is a directory, it throws and tells the user to specify the Dockerfile directly.

Container validation resolves Dockerfile paths relative to the config path at `packages/workers-utils/src/config/validation.ts:3333-3354`.

### Build and Deploy

`buildContainer()` in `packages/wrangler/src/containers/build.ts:93-116` calls `buildAndMaybePush()` with:

- Dockerfile path
- build context
- build args/image vars
- Docker binary path
- push enabled for deploy

`deployContainers()` in `packages/wrangler/src/containers/deploy.ts:76-168`:

- Fills API configuration for the `containers:write` scope.
- Builds Dockerfile-backed containers if needed.
- Fetches the uploaded Worker version to find the Durable Object namespace.
- Creates or updates the container application.

The deploy tests show the existing expected minimal config shape:

- `DEFAULT_DURABLE_OBJECTS` at `packages/wrangler/src/__tests__/containers/deploy.test.ts:3036-3046`
- `DEFAULT_CONTAINER_FROM_DOCKERFILE` at `packages/wrangler/src/__tests__/containers/deploy.test.ts:3054-3059`

The test config includes:

```ts
durable_objects: {
	bindings: [
		{
			name: "EXAMPLE_DO_BINDING",
			class_name: "ExampleDurableObject",
		},
	],
},
migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
containers: [
	{
		name: "my-container",
		max_instances: 10,
		class_name: "ExampleDurableObject",
		image: "./Dockerfile",
	},
]
```

The fixture `fixtures/vitest-pool-workers-examples/container-app/wrangler.jsonc` uses the same concept with `main`, `containers`, `durable_objects.bindings`, and `migrations`.

### What Auto-Config Would Need to Add for Containers

Wrangler can already deploy configured Containers. Auto-config would need to create the missing project shape:

- Detect a Dockerfile or compatible container-image entrypoint.
- Generate a Worker entrypoint that imports `@cloudflare/containers`, exports a `Container` subclass, and routes incoming fetch requests to one or more container instances.
- Install `@cloudflare/containers`.
- Generate `wrangler.jsonc` with `main`, `compatibility_date`, `observability`, `containers`, `durable_objects.bindings`, and `migrations`.
- Infer or prompt for the container port.
- Set class-level `defaultPort` in generated Worker code.
- Optionally set `envVars.PORT` so apps expecting `$PORT` listen on the same port.
- Choose a routing/scaling default: singleton, fixed random pool, path-keyed, or a future smarter helper.
- Warn about local Docker requirements and first-deploy container provisioning delay.

## Current Workers Node HTTP/HTTPS Support

The Express path does not need Containers. It can run directly on Workers when the app is compatible with Workers' Node HTTP server implementation.

Important public docs facts:

- `nodejs_compat` is required for Node APIs and polyfills.
- HTTP server-side methods need `enable_nodejs_http_server_modules` in addition to `nodejs_compat`.
- That server flag is automatically enabled for compatibility dates `2025-09-01` or later when `nodejs_compat` is enabled.
- `cloudflare:node` exports `httpServerHandler(server)`, `httpServerHandler({ port })`, and `handleAsNodeRequest(port, request)`.
- In Workers, `server.listen(port)` uses the port as an internal routing key, not an external network port.
- Only listen variants with a port number or no params are supported.
- The HTTP implementation does not support `upgrade`, direct socket access, trailing headers, `Expect: 100-continue`, or 1xx responses.
- The HTTPS server implementation exists, but Cloudflare handles TLS. TLS options such as `ca`, `cert`, `key`, `pfx`, `rejectUnauthorized`, and `secureProtocol` are unsupported.

The Express tutorial demonstrates the direct Workers pattern:

```ts
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import express from "express";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
	res.json({ message: "Express.js running on Cloudflare Workers!" });
});

app.listen(3000);
export default httpServerHandler({ port: 3000 });
```

Auto-config can generate or patch this bridge for many existing apps.

## Container-Platform DX Benchmark

A comparable container-platform launch matters because it sets a clear user expectation:

- Put a platform-specific Dockerfile or Containerfile at the project root.
- Run the platform's deploy command.
- The platform detects it, builds it, stores it in a managed registry, deploys it, autoscales it, and routes traffic to it.
- The app must speak HTTP and listen on `$PORT`, defaulting to `80`.

The important DX pattern is automatic detection of a root container build file plus automatic routing of all traffic to the resulting container image.

Comparable Express support is also useful as a product target:

- It detects files named `app`, `index`, or `server` in the root or under `src`.
- It supports default-exported Express apps and `app.listen(...)` patterns.
- It treats the Express app as one Function.
- `express.static()` is ignored; static assets must be under `public/**`.

Cloudflare can offer a similar first command, but the implementation is different:

- Some platforms route directly to a container-backed function.
- Cloudflare Containers require a Worker, a Container-backed Durable Object class, config, migration, and routing logic.
- That difference is exactly what Wrangler auto-config should hide.

## Architectural Findings

### 1. The Current Abstraction is "Framework With Output Directory"

The current `Framework` abstraction works when a detected framework can answer "what Cloudflare config and adapter changes are needed for this output directory?"

It is awkward for:

- API-only Workers.
- Express apps.
- Hono apps.
- Fastify/Koa/h3 apps.
- Raw `http.createServer()` apps.
- Dockerfile-backed Containers.
- Projects with an explicit entrypoint but no assets.
- Projects whose deploy target is a generated Worker shim rather than a framework build output.

The current `AutoConfigDetails` and `AutoConfigSummary` should not require `outputDir` for all non-configured projects.

### 2. Detection is Too Dependent on `@netlify/build-info`

`@netlify/build-info` is useful for common web frameworks. It is not enough for broader software detection.

We need custom detectors that can inspect:

- Root files: `Dockerfile`, `Containerfile`, and platform-specific variants.
- `package.json` dependencies and scripts.
- Candidate source files such as `index.js`, `index.ts`, `server.js`, `server.ts`, `app.js`, `app.ts`, `src/index.ts`, `src/server.ts`, and `src/app.ts`.
- AST patterns such as `express()`, `app.listen(...)`, `http.createServer(...)`, `https.createServer(...)`, `module.exports = app`, and `export default app`.
- Static file conventions such as `public/**` when relevant.

Netlify detection can remain the framework detector, but auto-config needs a broader detector pipeline.

### 3. Explicit Entrypoints Need a New Trigger Mode

The user's example `wrangler deploy index.js` is not achievable under current trigger rules because explicit `path` disables auto-config.

We should not simply remove that guard. It currently protects users who intentionally pass a Worker script or assets directory from unexpected project mutation.

A safer design is:

- Keep existing bare `wrangler deploy` behavior.
- Add an explicit-target detection mode only when there is no Wrangler config and the positional path is a single file or Dockerfile-like file.
- In explicit-target mode, only run a project adapter when confidence is high, for example an entry file that imports `express` and calls `listen()`.
- Fall back to today's `promptForMissingDeployConfig()` for normal Worker scripts and asset directories.
- In CI/non-interactive mode, require high-confidence detection or error with clear remediation.

This preserves current behavior while enabling `wrangler deploy index.js` for Express-like apps.

### 4. Compatibility Flags Should Belong to Adapters

Auto-config currently adds `nodejs_compat` to every generated config. That is convenient for modern JS frameworks, but it should not be global as the project space widens.

Better:

- Framework adapters that need Node compat add it.
- Express/Node server adapters add `nodejs_compat` and rely on a modern compatibility date for server module auto-enablement.
- Static sites do not add Node compat unless a specific adapter needs it.
- Container shims may not need `nodejs_compat` unless the generated Worker or user code does.

This also makes summaries more honest about why a flag is being added.

### 5. Auto-Config Needs a Plan/Apply Model

Today `framework.configure()` returns config fragments and script overrides, and sometimes mutates files directly. The package calls it twice: dry run and real run.

For broader software support, the adapter should return an explicit plan:

- Files to create.
- Files to patch.
- Dependencies to install.
- Package scripts to add.
- Wrangler config fragment to merge/write.
- Commands to run.
- Warnings to show.
- Follow-up instructions.

Then a shared runner can render the dry-run summary and apply the plan consistently.

This is especially valuable for Express and Containers because generated source files are part of the core configuration, not an implementation detail.

### 6. Container DX Requires Product Decisions, Not Just Code

Cloudflare has the technical bits to do something like a zero-config Dockerfile DX, but our platform shape exposes real choices:

- Singleton routing is simplest and cheapest to explain, but does not match "stateless autoscaling service" expectations.
- `getRandom(env.MY_CONTAINER, N)` provides a fixed pool for stateless workloads, but users or Wrangler must choose `N`, and this is not fully traffic-aware autoscaling.
- Path-keyed `getContainer(env.MY_CONTAINER, pathname)` is useful for stateful/session workloads but wrong as a generic HTTP backend default.
- `max_instances` defaults to 20 in normalization if omitted, but generated code still needs a routing policy that uses a specific instance set.

The ideal product may need a first-class stateless container routing helper in `@cloudflare/containers`, or at least a blessed generated pattern.

## Proposed New Abstraction

Introduce a general adapter model while keeping current framework support intact.

Sketch:

```ts
type ProjectKind =
	| "framework"
	| "static-assets"
	| "worker-entrypoint"
	| "node-http-server"
	| "container-image";

type DetectionCandidate = {
	id: string;
	name: string;
	kind: ProjectKind;
	confidence: "high" | "medium" | "low";
	evidence: string[];
	projectPath: string;
	packageManager: PackageManager;
	packageJson?: PackageJSON;
	workerName: string;
	buildCommand?: string;
	entrypoint?: string;
	outputDir?: string;
	port?: number;
	warnings?: string[];
};

type ConfigurationPlan = {
	wranglerConfig?: RawConfig;
	packageJsonScripts?: Record<string, string>;
	dependencies?: Array<{ name: string; dev?: boolean }>;
	filesToCreate?: Array<{ path: string; contents: string }>;
	filesToPatch?: Array<{ path: string; description: string }>;
	commands?: Array<{ command: string; when: "setup" | "build" }>;
	warnings?: string[];
	summaryFields?: Record<string, string | number | boolean>;
};

interface ProjectAdapter {
	id: string;
	name: string;
	kind: ProjectKind;
	detect(context: DetectionContext): Promise<DetectionCandidate[]>;
	configure(candidate: DetectionCandidate, context: AutoConfigContext): Promise<ConfigurationPlan>;
}
```

Existing framework classes can become adapters or be wrapped by a `FrameworkProjectAdapter`. This avoids a disruptive rewrite while creating room for non-framework project types.

Key changes needed:

- `AutoConfigDetails` should hold a selected `DetectionCandidate` or equivalent.
- `outputDir` should become optional and adapter-specific.
- The confirmation prompt should display fields based on `kind` rather than always asking for framework and output directory.
- The summary should show `projectKind`, `adapterId`, generated entrypoint, container image, port, and output directory only when applicable.
- `nodejs_compat` should no longer be added globally.
- `runAutoConfig()` should consume an explicit plan and apply it.
- Telemetry should record `projectKind`, `adapterId`, `confidence`, configured/not configured, and failure stage.

## Detection Pipeline Proposal

A practical detection order:

1. Existing config check. If a non-Pages Wrangler config exists, return already configured, as today.
2. Explicit target detector. If the command passed `path`, inspect only that target and use high-confidence adapters. This enables `wrangler deploy index.js` without changing explicit assets behavior.
3. Container detector. Look for platform-specific Dockerfile or Containerfile variants first, then root `Dockerfile` or `Containerfile` as a local prompt candidate.
4. Node server detector. Look for Express/Fastify/Koa/raw HTTP server projects from package dependencies plus source patterns.
5. Existing web framework detector. Keep `@netlify/build-info` and framework registry.
6. Static detector. Use the existing `index.html` output directory heuristic as the fallback.

Confidence guidance:

- Platform-specific Dockerfile or Containerfile variant at root: high confidence.
- Root `Dockerfile` with no Wrangler config: medium confidence locally, maybe high only when no other candidate exists.
- Root `Dockerfile` inside a recognized frontend framework project: low confidence unless user selects it.
- Explicit `wrangler deploy Dockerfile`: high confidence for container setup if we choose to support this syntax.
- `package.json` has `express` and entry file imports/requires `express`: high confidence.
- `package.json` has `express` but no source patterns: medium confidence.
- `http.createServer(...).listen(...)` in explicit entrypoint: high confidence for Node HTTP server adapter.
- Multiple high-confidence candidates in CI: error and ask for local `wrangler setup` or an explicit flag.

## Express and Node HTTP Server Auto-Config

### Why This Is a Good First Expansion

Express is a smaller first step than Containers:

- It does not require Docker.
- It does not require a Durable Object migration.
- It does not require product decisions about container pool size or scaling semantics.
- It directly uses documented Workers runtime support.
- It validates the new no-output-dir adapter model.

### Candidate Detection

Detect likely Node HTTP server projects using:

- `package.json` dependencies: `express`, then later `fastify`, `koa`, `@hono/node-server`, `h3`, etc.
- Entrypoint names: `app`, `index`, `server`, under root and `src`, with JS/TS/CJS/MJS variants.
- Explicit CLI path: `wrangler deploy index.js` should inspect exactly `index.js`.
- AST/source patterns:
  - `import express from "express"`
  - `const express = require("express")`
  - `const app = express()`
  - `app.listen(3000)`
  - `http.createServer(...)`
  - `https.createServer(...)`
  - `server.listen(...)`
  - `export default app`
  - `module.exports = app`

### Generated Configuration

For a project with `src/index.ts` and detected port `3000`, generate something like:

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "my-express-app",
	"main": "src/worker.ts",
	"compatibility_date": "2026-07-03",
	"compatibility_flags": ["nodejs_compat"],
	"observability": {
		"enabled": true
	}
}
```

The `enable_nodejs_http_server_modules` flag should not be needed with a generated current compatibility date because docs say it is auto-enabled for compatibility dates `2025-09-01` or later when `nodejs_compat` is enabled. If users lower the compatibility date, we should either add the explicit flag or warn.

### Generated Worker Wrapper

For apps that already call `listen(port)`, the wrapper can import the app module for side effects and export `httpServerHandler({ port })`:

```ts
import { httpServerHandler } from "cloudflare:node";

await import("./index");

export default httpServerHandler({ port: 3000 });
```

For apps that default-export an Express app but do not call `listen()`, the wrapper can listen itself:

```ts
import { httpServerHandler } from "cloudflare:node";
import app from "./index";

app.listen(3000);

export default httpServerHandler({ port: 3000 });
```

The actual generator should choose static imports where possible and dynamic imports only when it needs to set `process.env.PORT` before loading the user's module.

### Port Detection

Port inference should support:

- Numeric literals: `app.listen(3000)`.
- Constants in the same module: `const port = 3000; app.listen(port)`.
- Common fallbacks: `process.env.PORT || 3000`, `process.env.PORT ?? 3000`.
- No obvious port: prompt locally, default to `3000`; in CI either use `3000` with warning for Express or error for raw HTTP if unsafe.

For apps that depend on `$PORT`, the wrapper can set `process.env.PORT` before importing the app module if needed.

### Warnings and Unsupported Patterns

Auto-config should warn or block when it sees:

- `https.createServer()` with TLS options such as `key`, `cert`, `pfx`, `ca`, or `rejectUnauthorized`.
- Use of HTTP `upgrade` or WebSocket libraries that rely on Node's upgrade event.
- Direct socket access patterns.
- `listen()` variants with hostname, path, backlog, or unsupported signatures.
- `express.static()` if users expect Worker Assets behavior. We should decide whether to preserve it through bundled assets or recommend/migrate to Workers Static Assets.
- Native Node addons or dependencies known not to work in Workers.

### MVP Scope

Start with:

- Express only.
- ESM and CJS imports/requires.
- `app.listen(<number>)` and default-exported app.
- Explicit path and bare deploy modes.
- Generated wrapper, not patching user source.
- `nodejs_compat` and current compatibility date.

Defer:

- Complex port expressions.
- Multi-server apps.
- Automatic static asset migration.
- Fastify/Koa support.
- Apps requiring unsupported `upgrade` behavior.

## Dockerfile to Containers Auto-Config

### Why This Is More Than Another Framework Adapter

A Dockerfile project does not produce a Workers asset directory or Worker entrypoint. It produces an image. Cloudflare still needs a Worker to route requests into a Container-backed Durable Object.

Auto-config therefore needs to generate the Worker side of the deployment, not just a config file.

### Candidate Detection

Detect:

- Platform-specific Dockerfile variant at project root.
- Platform-specific Containerfile variant at project root.
- `Dockerfile` at project root.
- `Containerfile` at project root.
- Potential future explicit target: `wrangler deploy Dockerfile`.

Recommended confidence:

- Platform-specific Dockerfile and Containerfile variants: high confidence. These files intentionally encode deploy-to-platform behavior.
- `Dockerfile` and `Containerfile`: prompt locally because many repos include Dockerfiles for local development, CI, databases, or build tooling.
- In non-interactive mode, use root `Dockerfile` only when there are no stronger framework or Worker candidates, or require an explicit flag.

### Port Detection

Infer from:

- Dockerfile `EXPOSE` instructions.
- `ENV PORT=...`.
- Known framework defaults only as a weak fallback.
- Container-platform convention: `$PORT` defaults to `80`.

Recommended Cloudflare default:

- If `EXPOSE` is present and single, use it.
- If `EXPOSE` has multiple ports, prompt for the HTTP port.
- If a platform-specific Dockerfile variant exists and no `EXPOSE`, default to `80` with a warning because that matches common container-platform expectations.
- If plain `Dockerfile` exists and no `EXPOSE`, prompt locally and use `8080` or `3000` only with explicit user confirmation.

For local dev, Cloudflare docs say `EXPOSE` is important because Wrangler needs to connect to ports locally, even if production does not require it. Auto-config should warn when no `EXPOSE` exists and suggest adding one.

### Generated Worker Code

Generated TypeScript shape:

```ts
import { Container, getRandom } from "@cloudflare/containers";

export class AppContainer extends Container {
	defaultPort = 8080;
	sleepAfter = "10m";
	envVars = {
		PORT: "8080",
	};
}

type Env = {
	APP_CONTAINER: DurableObjectNamespace<AppContainer>;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const container = await getRandom(env.APP_CONTAINER, 3);
		return container.fetch(request);
	},
};
```

For JavaScript projects, generate JavaScript without TypeScript annotations.

Open question: default to `getRandom()` or `getContainer()`?

- `getContainer(env.APP_CONTAINER)` is simplest and safest for cost, but creates one singleton instance by default.
- `getRandom(env.APP_CONTAINER, N)` better matches stateless HTTP service expectations, but requires choosing `N` and can cold-start multiple instances.
- The best long-term DX may be a first-class `getStatelessContainer()` or similar helper that encapsulates routing policy.

My recommendation:

- MVP defaults to singleton or a small fixed pool only after a product decision.
- If the product promise is "stateless autoscaling workloads", prefer a pool with a visible prompt such as "How many container instances should Wrangler route across?" and set `max_instances` to the same number.
- For CI/non-interactive, default conservatively to `max_instances: 1` unless a config/flag specifies otherwise.

### Generated Wrangler Config

Generated JSONC shape:

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "my-container-app",
	"main": "src/worker.ts",
	"compatibility_date": "2026-07-03",
	"observability": {
		"enabled": true
	},
	"containers": [
		{
			"name": "my-container-app",
			"class_name": "AppContainer",
			"image": "./Dockerfile",
			"max_instances": 1
		}
	],
	"durable_objects": {
		"bindings": [
			{
				"name": "APP_CONTAINER",
				"class_name": "AppContainer"
			}
		]
	},
	"migrations": [
		{
			"tag": "v1",
			"new_sqlite_classes": ["AppContainer"]
		}
	]
}
```

Notes:

- `new_sqlite_classes`, not `new_classes`, is required for Container Durable Objects.
- `class_name` in `containers` must match the generated Durable Object class.
- The Durable Object binding class must be in the same Worker.
- `@cloudflare/containers` should be installed as a project dependency because generated Worker source imports it.

### User-Facing Flow

Potential local flow:

```txt
Detected Project Settings:
 - Project Type: Container image
 - Dockerfile: Dockerfile
 - Container Port: 8080 (from EXPOSE)
 - Routing: singleton container instance
 - Worker Name: my-container-app

Wrangler will:
 - Install @cloudflare/containers
 - Create src/worker.ts
 - Create wrangler.jsonc with containers, Durable Object binding, and migration
 - Build and push your image during deploy

Proceed with setup?
```

Warnings to include:

- Docker must be installed and running for local Dockerfile builds.
- First deploy can take several minutes before container calls succeed.
- Containers require Workers Paid plan.
- Plain Dockerfile detection may not mean "deploy this as the app"; ask for confirmation.
- If no `EXPOSE`, local dev may fail or need manual port configuration.
- If image is private/remote, guide users to `wrangler containers registries configure`.

### Dashboard/Workers Builds Considerations

Auto-config is also used through Workers Builds automatic PRs when deploy command is exactly `npx wrangler deploy`.

For Containers:

- The generated PR should include `src/worker.ts`, `wrangler.jsonc`, and `package.json` changes.
- The preview deployment environment must have Docker available if it is expected to build a local Dockerfile.
- If Docker is unavailable in Builds, the automatic PR can still be useful, but preview deployment may fail until the build environment supports container image builds.
- Non-interactive Dockerfile detection should likely be more conservative than local detection.

## Product/API Prerequisites

Before or alongside implementation, decide these product contracts:

1. Does `wrangler deploy Dockerfile` mean "deploy this as a Container"?
2. Does root `Dockerfile` always imply Containers, or only platform-specific Dockerfile/Containerfile variants?
3. What is the default Container routing policy: singleton, fixed random pool, path-keyed, or new helper?
4. What default `max_instances` should auto-config generate?
5. Should the generated Container Worker set `envVars.PORT` automatically?
6. Should generated Container code be TypeScript or JavaScript based on project detection?
7. Should Wrangler detect and warn about Paid plan requirements before writing files, before deploy, or both?
8. Should `nodejs_compat` continue to be globally added for legacy framework adapters, or should each adapter own it immediately?
9. Should auto-config ever update an existing Wrangler config, or only configure projects with no config as today?
10. Should dashboard automatic PRs support Dockerfile projects immediately, or should Containers start as local-only auto-config?

## Phased Implementation Plan

### Phase 0: Define Product Contract

Decisions:

- Decide accepted Dockerfile names and confidence behavior.
- Decide whether explicit `wrangler deploy <file>` can trigger auto-config.
- Decide default Container routing and `max_instances`.
- Decide whether Container auto-config is behind an experimental flag first.
- Decide whether Dashboard automatic PRs should include Containers from day one.

Output:

- Short product spec for Express and Containers flows.
- CLI examples and final generated code/config examples.

### Phase 1: Refactor Auto-Config Core

Goal: make current framework auto-config one adapter family in a broader project-adapter system.

Changes:

- Introduce `ProjectKind`, `DetectionCandidate`, and `ConfigurationPlan` concepts.
- Make `outputDir` optional in auto-config details and summary.
- Move Node compatibility flag insertion from global `runAutoConfig()` into adapters.
- Replace hard-coded confirmation prompts with kind-aware prompts.
- Replace framework-only summary fields with generic summary rendering.
- Add evidence and warning display.
- Add explicit target mode plumbing from `wrangler deploy` to detection.
- Preserve current framework behavior and snapshots as much as possible.

Tests:

- Existing framework tests should still pass with minimal snapshot changes.
- Add unit tests for no-output-dir candidates.
- Add tests that explicit Worker script deploys still skip auto-config unless a high-confidence adapter matches.

### Phase 2: Ship Express/Node Server Adapter

Goal: `wrangler deploy` and `wrangler deploy index.js` work for common Express apps.

Scope:

- Detect Express dependency plus source patterns.
- Support `app.listen(3000)`.
- Support default-exported app.
- Generate Worker wrapper.
- Generate `wrangler.jsonc` with `main`, `compatibility_date`, `nodejs_compat`, and observability.
- Add `deploy`, `preview`, and `cf-typegen` scripts where applicable.
- Warn for unsupported HTTP/HTTPS server patterns.

Tests:

- Unit tests for detection and port inference.
- Integration tests for bare `wrangler deploy` in an Express project.
- Integration tests for `wrangler deploy index.js` in an Express project.
- Dry-run summary snapshots.
- Negative tests for plain Worker `index.js` continuing through existing deploy config prompts.

### Phase 3: Ship Dockerfile-to-Containers Adapter

Goal: `wrangler deploy` in a project with a Dockerfile can create the Worker shim and config needed for Containers.

Scope:

- Detect platform-specific Dockerfile/Containerfile variants, `Dockerfile`, and `Containerfile`.
- Parse `EXPOSE` and `ENV PORT` enough for port inference.
- Prompt for port/routing/max instances when needed.
- Generate Worker entrypoint with `Container` subclass.
- Install `@cloudflare/containers`.
- Generate `wrangler.jsonc` with `containers`, `durable_objects`, and `migrations`.
- Show Docker/Paid-plan/provisioning warnings.
- Reuse existing deploy pipeline for build and rollout.

Tests:

- Detector tests for Dockerfile names and confidence.
- Port inference tests for `EXPOSE` variants.
- Dry-run summary snapshots.
- Wrangler deploy tests with mocked Docker/container APIs proving generated config flows into existing container build/deploy.
- Negative tests for projects with Dockerfile plus stronger framework detection.

### Phase 4: Expand Software Support

After the abstraction exists, support more "software beyond frameworks":

- Hono as API-only Worker project, replacing current unsupported registry entry.
- Fastify/Koa/h3 Node server adapters.
- Raw `http.createServer()` projects.
- Other containerized stacks through Dockerfile: Rails, Spring Boot, Go, FastAPI, Laravel, ASP.NET, nginx.
- Static asset + API hybrids, with explicit asset strategy.

## Suggested MVP Order

Recommended order:

1. Refactor just enough to allow no-output-dir adapters and explicit target detection.
2. Implement Express auto-config.
3. Use learnings to implement Dockerfile-to-Containers behind an experimental flag or limited high-confidence detection.
4. Graduate Dockerfile support once routing/scaling defaults and Builds behavior are resolved.

Why Express first:

- It directly addresses a clear user ask.
- It is technically smaller.
- It pressures the exact abstraction issue, `outputDir` being required.
- It avoids premature product promises about Containers autoscaling.

Why Containers second:

- The lower-level Wrangler deploy path already exists.
- The generated Worker/config shape is clear.
- The remaining uncertainty is mostly DX/product policy, not whether it is technically possible.

## Risks

### Surprising Mutation

Broad detection can be wrong. A root Dockerfile may be for local Postgres, not the app. An `index.js` file may be a normal Worker, not Express. Keep detection confidence visible and prompt locally.

### Backward Compatibility

Current tests assert explicit `wrangler deploy <script>` skips auto-config. Any change here must be narrow and high-confidence to avoid breaking existing workflows.

### Existing Configs

Auto-config currently skips projects with non-Pages Wrangler config. That is safe, but it means "make my existing Express app just work" only applies before config exists. A future `wrangler setup --repair` or `wrangler setup --adapter express` mode may be useful, but should not be part of the MVP.

### Generated Source Ownership

Generated Worker wrappers become user-owned source files. We need stable, readable output and a clear comment explaining why the wrapper exists. Avoid hiding important code in `.wrangler` because users need to understand and modify routing.

### Container Scaling Semantics

Comparable container-platform messaging often says "autoscaling". Cloudflare's generated code must pick a routing strategy. If we pick singleton, the feature works but may disappoint. If we pick a fixed pool, it is closer but still not truly traffic-aware. Consider adding or blessing a smarter helper before broad GA.

### Local Docker and Builds

Local Docker is required for Dockerfile builds. Workers Builds may need explicit support to build container images during previews. If not ready, local Wrangler support and dashboard automatic PR support may need different rollout timelines.

### Node Compatibility Gaps

Express itself can run, but Node ecosystem dependencies may use unsupported APIs. The adapter should warn based on obvious patterns, but it cannot prove full runtime compatibility statically.

## Bottom Line

Wrangler can reach the "just run deploy" experience for Express and Dockerfile projects, but not by treating them as more web frameworks. The current auto-config implementation should be generalized from framework/output-directory configuration into project detection plus adapter-owned configuration plans.

Once that prerequisite exists, Express is a straightforward first adapter. Containers are also technically feasible because Wrangler already has the build/push/deploy path, but the generated Worker routing policy and product promise around stateless autoscaling need to be decided before making it feel simple and trustworthy.
