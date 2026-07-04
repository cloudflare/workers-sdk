# Wrangler Auto-Config Expansion Plan

This note researches whether Wrangler's existing automatic configuration feature can grow from "detect supported web frameworks and configure Workers" into a broader "run `wrangler deploy` and Wrangler figures out what this project is" experience. It focuses on three near-term examples:

- Single file, static folder, and simple web app deployments that should eventually feel as direct as `dply index.html`, `dply ./my-website`, or `dply ./my-vite-app`.
- Dockerfile projects that could be deployed as Cloudflare Containers.
- Express or Node HTTP server projects that could be deployed directly to Workers using Node.js HTTP server compatibility.

## Executive Summary

We can build this, but the current auto-config implementation is not yet shaped for it.

The current implementation is intentionally centered on frontend/full-stack JavaScript frameworks with asset output directories. It assumes every non-configured project has a `framework` and an `outputDir`, and it runs only for bare `wrangler deploy` or `wrangler setup`. That design worked for framework adapters, but it is too narrow for API-only Workers, Express apps, Hono apps, Dockerfile-backed Containers, and the simplest possible site deploys where the user points the CLI at one file or one folder and expects a URL.

The good news is that the lower-level technical pieces already exist:

- Wrangler deploy already knows how to build a configured local Dockerfile, push it, deploy the Worker, and roll out a Container application.
- Workers runtime already supports enough Node.js HTTP server APIs for Express-style apps through `nodejs_compat` and `cloudflare:node`'s `httpServerHandler`.
- Wrangler deploy already has most of the asset-upload plumbing that a thin wrapper can compose for `index.html`, static folders, Vite output, and normal Worker scripts. It also already maps a positional directory to assets and a positional file to a Worker script; the gap is preserving high-confidence user intent before that split turns `index.html` into an opaque script and `./my-vite-app` into raw assets.
- The auto-config package already has a useful detect, prompt, dry-run, write config, install package, update scripts, and metrics loop.

The main missing layer is a more general "project adapter" abstraction that can represent multiple deployment target shapes, not just web frameworks with static/SSR output directories.

Recommended direction:

1. Refactor auto-config around `ProjectAdapter` or `ProjectRecipe` candidates, while preserving existing framework adapters as one adapter family.
2. Make `outputDir` optional and move compatibility flags, source file generation, dependencies, and warnings into adapter-owned plans.
3. Add custom detectors for explicit files/folders, Node HTTP servers, and Dockerfiles alongside `@netlify/build-info` framework detection.
4. Ship `wrangler deploy index.html` first as the only unflagged simple-deploy behavior change. It is the least ambiguous explicit target and directly addresses the wrapper-shaped DX gap.
5. Put static-folder and static-app reinterpretation behind an explicit rollout gate until telemetry, tests, and release timing prove it is safe. These change existing positional directory semantics and may need a major release.
6. Ship Express/Node server auto-config next because it exercises the new no-asset, entrypoint-wrapper path without needing Containers product decisions.
7. Ship Dockerfile-to-Containers after product decisions about default scaling/routing, local Docker prerequisites, paid-plan messaging, and generated Worker shape.

Scope commitment:

- This is a full implementation roadmap, not an `index.html`-only first-slice plan.
- Express/Node server auto-config is in scope and should be implemented as Phase 3 after the adapter/plan plumbing exists.
- Dockerfile-to-Containers auto-config is in scope and should be implemented as Phase 4 behind the Containers auto-config gate, starting local-only.
- Folder/static-app reinterpretation is also in scope, but it remains gated until compatibility risk is understood.
- Sequencing below describes dependency order and rollout safety. It does not make later phases optional.

## Source Material

Code inspected:

- `packages/wrangler/src/deploy/index.ts`
- `packages/wrangler/src/deploy/autoconfig.ts`
- `packages/wrangler/src/deployment-bundle/deploy-args.ts`
- `packages/wrangler/src/deployment-bundle/entry.ts`
- `packages/wrangler/src/deployment-bundle/resolve-entry.ts`
- `packages/wrangler/src/assets.ts`
- `packages/wrangler/src/output.ts`
- `packages/wrangler/src/user/user.ts`
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
- `southpolesteve/dply` README and `src/main.ts` for the wrapper DX that motivated this update.

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
- dply source: https://github.com/southpolesteve/dply

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

### Current Positional Deploy and Assets Behavior

`wrangler deploy` and `wrangler versions upload` both accept a positional `path`. The positional path is not ignored today. `validateDeployVersionsArgs()` in `packages/wrangler/src/deployment-bundle/deploy-args.ts:206-273` resolves it before config is read:

- If `path` exists and is a directory, it sets `args.assets = args.path` unless `--assets` was already supplied.
- If `path` exists and is not a directory, it sets `args.script = args.path`.
- If `stat()` fails, it assumes the path is a script and lets downstream entrypoint validation fail.
- The original `args.path` remains available, but later deploy code primarily sees `args.script` or `args.assets`.

This means current behavior already supports important explicit-target cases:

- `wrangler deploy ./site` can deploy `./site` as assets.
- `wrangler deploy --assets ./site` can deploy the same directory as assets.
- `wrangler versions upload ./site` can upload assets with a version.
- `wrangler deploy ./src/index.ts` continues to deploy a normal Worker script.

The current split also creates the DX gap this plan addresses:

- `wrangler deploy index.html` is treated as a Worker script because it is a file, even though user intent is almost certainly a single-file site.
- `wrangler deploy ./my-vite-app` is treated as raw assets because it is a directory, even though user intent may be "build this app and deploy the output".
- `wrangler deploy index.js` is treated as an opaque Worker script, so an Express app cannot be wrapped with `cloudflare:node` before bundling.

`getEntry()` in `packages/wrangler/src/deployment-bundle/entry.ts:28-114` then chooses the deployment entry:

- `args.script` wins first and is resolved as the Worker entrypoint.
- `config.main` and Workers Sites `entry-point` come next.
- `args.assets` or `config.assets` uses `resolveEntryWithAssets()`, which points at Wrangler's `templates/no-op-worker.js`; this is the assets-only Worker path.

Any explicit-target auto-config implementation must account for this order. It should not simply start "paying attention" to a previously ignored positional argument. Instead, it must preserve the original target intent, decide whether a high-confidence adapter should override the current script/assets interpretation, and fall back to today's behavior for normal Worker scripts and raw asset directories.

### When Auto-Config Runs

`maybeRunAutoConfig()` only runs for a bare deploy command:

```ts
const shouldRunAutoConfig =
	args.autoconfig && !args.path && !args.script && !args.assets && !args.config;
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

More precisely, the blocker is the combination of two current behaviors:

- Auto-config intentionally skips when `args.path`, `args.script`, or `args.assets` is present.
- The deploy argument validator has already converted the positional path into `args.script` or `args.assets` before the deploy handler starts.

The future implementation should pass an explicit deployment intent into detection, for example `{ originalPath, resolvedKind, currentArgsInterpretation }`, rather than relying only on the mutated `args.script`/`args.assets` values.

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

### Current Temporary Preview Account Support

`wrangler deploy` already opts into the hidden `--temporary` flag through `supportTemporary: true` in `packages/wrangler/src/deploy/index.ts:94-105`.

The command registration layer adds the hidden flag and enables temporary-account auth only when the command supports it and the user passes `--temporary`:

- The flag definition is in `packages/wrangler/src/core/temporary-commands.ts:1-7`.
- `register-yargs-command.ts:234-237` calls `setTemporaryAllowed()` based on command support and the parsed flag.
- `requireAuth()` in `packages/wrangler/src/user/user.ts:538-570` activates a temporary preview account when temporary auth is allowed.
- `requireAuth()` refuses `--temporary` when the user is already authenticated, when `CLOUDFLARE_API_TOKEN` is set, or when the compliance region is not public.
- On missing auth in non-interactive mode, command error handling appends a hint to rerun with `--temporary` at `packages/wrangler/src/core/register-yargs-command.ts:399-409`.

The current logger output includes the full claim URL in `logTemporaryPreviewAccount()` at `packages/wrangler/src/user/user.ts:178-191`.

For this plan, the important correction is that Wrangler does not need a new temporary-account system, and simple deploy should not auto-enable the existing one. If the user is unauthenticated, keep the current auth failure or hint flow. Temporary preview accounts should be used only when the user explicitly passes `--temporary`.

Claim URL handling is therefore not part of the simple-deploy slice. The only safety requirement here is that new intent plumbing, telemetry, and structured output must not make claim-token handling worse for explicit `--temporary` users.

### Current Structured Output

Wrangler already has machine-readable output through `writeOutput()` in `packages/wrangler/src/output.ts:17-29`, controlled by `WRANGLER_OUTPUT_FILE_PATH` and `WRANGLER_OUTPUT_FILE_DIRECTORY`.

Relevant existing output entries:

- `deploy` entries include `worker_name`, `worker_tag`, `version_id`, `targets`, `worker_name_overridden`, and `wrangler_environment` at `packages/wrangler/src/output.ts:90-104`.
- `autoconfig` entries include the triggering command and `AutoConfigSummary` at `packages/wrangler/src/output.ts:124-130`.
- Deploy tests assert both deploy and auto-config entries are written when auto-config runs at `packages/wrangler/src/__tests__/deploy/core.test.ts:1989-2059`.
- Setup tests assert auto-config summary output at `packages/wrangler/src/__tests__/setup.test.ts:142-202`.

This plan should extend the existing output entry types and summaries rather than invent a second result channel. Useful new fields include selected adapter, project kind, detection confidence, deploy mode, generated temporary paths by category rather than absolute value, and URL verification status.

### What the dply Wrapper Proves

The `dply` wrapper is useful evidence because it is not a separate deployment platform. It is a thin, opinionated layer around Wrangler that demonstrates the DX users and coding agents expect for small deploys:

```sh
dply
dply index.html
dply ./site
dply ./my-vite-app
```

From its README and implementation, `dply` does the following:

- Accepts zero or one local file/directory argument.
- Detects single HTML files, single static assets, static folders with `index.html`, Vite-family apps, obvious Worker-like JS/TS files, existing Wrangler projects, and a delegated path for specific framework projects.
- For a single `index.html`, creates a temporary static assets directory containing that file as `index.html`.
- For a single non-HTML static asset, creates a temporary static assets directory and a generated `index.html` that links to the asset.
- For a Worker-like JS/TS file, generates a temporary Worker adapter project that imports the source and normalizes default/exported fetch handlers.
- For static folders, deploys the folder as assets.
- For package apps that clearly build to static assets, installs dependencies when needed, runs the build, then deploys `dist/` when `dist/index.html` exists.
- Shells out to `npx --yes wrangler@latest deploy` rather than replacing Wrangler.
- Supplies `--name` and `--compatibility-date` automatically for generated deploys.
- Uses `--assets` for asset deploys and a temporary Wrangler working directory to avoid inheriting unrelated parent config.
- Uses temporary Cloudflare preview account support when Wrangler is not authenticated.
- Verifies the deployed URL after deploy.
- Prints labeled, agent-readable output: selected adapter, source, generated project, deploy mode, live URL, verification result, decisions/actions, and next steps.

This is exactly the kind of UX auto-config should absorb. It exists because the upstream path has too many tiny concepts for the simplest case: name, compatibility date, config-file prompting, asset-vs-script flags, auth state, temporary deploys, generated wrapper code, and output parsing.

The key lesson is not that Wrangler needs a separate wrapper. The key lesson is that auto-config needs a low-ceremony path for explicit local targets.

Concrete upstream targets:

- `wrangler deploy index.html` should deploy a single HTML file as a site without asking the user to understand assets, config files, or generated directories.
- `wrangler deploy ./my-website` should eventually deploy a folder with `index.html` as static assets through the lower-ceremony path, but this should be gated because directories already have working positional semantics today.
- `wrangler deploy ./my-vite-app` should eventually detect a static build app, run or offer to run its build, and deploy the output, but this should be gated because it changes today's raw-assets interpretation.
- `wrangler deploy index.js` should keep deploying normal Worker files, but if the file is a high-confidence Express-like or Node HTTP server target, it should select the right adapter instead of treating it as an opaque script.
- `wrangler deploy` already has hidden `--temporary` support. Simple deploy must not auto-enable it; unauthenticated users should continue to fail or receive an explicit rerun hint unless they pass `--temporary` themselves.
- The CLI should verify the resulting URL when possible and make the live URL machine-readable in structured output.
- The CLI should explain decisions tersely, but the simple path should avoid the full "Detected Project Settings / write wrangler.jsonc?" ceremony unless persistence is valuable.

There is a product split here:

- Persistent setup mode should keep writing `wrangler.jsonc`, package scripts, `.gitignore`, and framework adapter changes.
- No-write deploy mode should be allowed to generate temporary local working directories/config and deploy normally without leaving repository files behind.

The existing `promptForMissingDeployConfig()` flow is close to the persistent setup mode. It is not enough for the `dply` use case because it does not run project detection, still asks config questions, and does not provide the deliberately simple deploy/result contract.

No-write deploy is a proposed new product behavior, not today's default Wrangler behavior. Today, explicit directory/assets deploys can prompt for name, compatibility date, and whether to write `wrangler.jsonc`. The no-write recommendation comes from the wrapper-style DX and is strongest for `wrangler deploy index.html`: writing a useful persistent config for one file is not straightforward unless Wrangler also creates a durable assets directory or points config at the whole project root, both of which can be surprising. For static folders and package apps, the right persistence default is less obvious, so those behavior changes should stay behind a rollout gate until product decides whether no-write, prompt-to-save, or setup-first is the right default.

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

Until that validation changes, generated auto-config should write an explicit Dockerfile path such as `"./Dockerfile"`, not a project directory path, even when the detected target is a directory containing a Dockerfile.

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
- Set `envVars.PORT` so apps expecting `$PORT` listen on the same port.
- Use singleton routing for the first Containers rollout, with `max_instances: 1` in generated config.
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

- Put an explicit container build file at the project root.
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

- Single-file site deploys.
- Static folders passed explicitly to deploy.
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

- Root files: `Dockerfile`, `Containerfile`, and future Cloudflare-specific marker names if product adds them.
- `package.json` dependencies and scripts.
- Candidate source files such as `index.js`, `index.ts`, `server.js`, `server.ts`, `app.js`, `app.ts`, `src/index.ts`, `src/server.ts`, and `src/app.ts`.
- AST patterns such as `express()`, `app.listen(...)`, `http.createServer(...)`, `https.createServer(...)`, `module.exports = app`, and `export default app`.
- Static file conventions such as `public/**` when relevant.

Netlify detection can remain the framework detector, but auto-config needs a broader detector pipeline.

### 3. Explicit Entrypoints Need a New Trigger Mode

The user's example `wrangler deploy index.js` is not achievable under current trigger rules because explicit `path` disables auto-config. The path has also already been interpreted as either `args.script` or `args.assets` before the deploy handler starts.

We should not simply remove the guard. It currently protects users who intentionally pass a Worker script or assets directory from unexpected project mutation, and those paths already work. It also means the simplest wrapper-style inputs bypass the richer auto-config code.

A safer design is:

- Keep existing bare `wrangler deploy` behavior.
- Add an explicit-target detection mode when there is no Wrangler config and the original positional path is a file or directory.
- Pass detection both the original target and Wrangler's current interpretation, for example `index.html -> script` or `./site -> assets`.
- In explicit-target mode, only override today's interpretation for high-confidence targets: a single HTML file, a directory with `index.html`, an obvious static package app, or an entry file that imports `express` and calls/listens as a Node HTTP server.
- Do not run the new adapter path for normal Worker scripts; let the existing deploy pipeline handle them.
- Fall back to today's `promptForMissingDeployConfig()` for normal Worker scripts and asset directories.
- In CI/non-interactive mode, require high-confidence detection or error with clear remediation.

This preserves current behavior while enabling `wrangler deploy index.html` first, and later enabling low-ceremony `wrangler deploy ./site`, `wrangler deploy ./static-app`, and `wrangler deploy index.js` for Express-like apps behind the appropriate rollout gates.

Before reinterpreting positional-argument semantics, add privacy-preserving telemetry to prove how risky this is. The telemetry should record only shape-level facts such as whether a positional argument was present, whether it resolved to a file or directory, a coarse extension/category, whether config was present, Wrangler's current interpretation, and which deploy path handled it. It should not record raw paths, filenames, command strings, URLs, claim tokens, or anything that could contain secrets.

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
- Whether the plan is persistent or no-write.

Then a shared runner can render the dry-run summary and apply the plan consistently.

This is especially valuable for Express and Containers because generated source files are part of the core configuration, not an implementation detail.

It is also valuable for wrapper-style simple deploys because the correct plan may be no-write: generate a temporary static directory, generate a temporary wrapper for a later explicit adapter, pass deploy arguments to Wrangler, verify the URL, and leave no repository files behind.

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
	| "single-file-site"
	| "worker-entrypoint"
	| "node-http-server"
	| "container-image";

type DetectionCandidate = {
	id: string;
	name: string;
	kind: ProjectKind;
	trigger: "bare" | "explicit-target" | "setup";
	confidence: "high" | "medium" | "low";
	evidence: string[];
	projectPath: string;
	originalTarget?: string;
	currentDeployInterpretation?: "script" | "assets" | "none";
	sourceCategory?:
		| "html-file"
		| "static-file"
		| "directory"
		| "package-app"
		| "worker-script"
		| "dockerfile";
	packageManager: PackageManager;
	packageJson?: PackageJSON;
	workerName: string;
	buildCommand?: string;
	entrypoint?: string;
	assetsDirectory?: string;
	outputDir?: string;
	port?: number;
	noWrite?: boolean;
	warnings?: string[];
};

type ConfigurationPlan = {
	mode: "persistent" | "no-write";
	wranglerConfig?: RawConfig;
	packageJsonScripts?: Record<string, string>;
	dependencies?: Array<{ name: string; dev?: boolean }>;
	filesToCreate?: Array<{ path: string; contents: string }>;
	filesToPatch?: Array<{ path: string; description: string }>;
	commands?: Array<{ command: string; when: "setup" | "build" }>;
	warnings?: string[];
	deployArgs?: Record<string, string | boolean | string[]>;
	summaryFields?: Record<string, string | number | boolean>;
};

interface ProjectAdapter {
	id: string;
	name: string;
	kind: ProjectKind;
	detect(context: DetectionContext): Promise<DetectionCandidate[]>;
	configure(
		candidate: DetectionCandidate,
		context: AutoConfigContext
	): Promise<ConfigurationPlan>;
}
```

Existing framework classes can become adapters or be wrapped by a `FrameworkProjectAdapter`. This avoids a disruptive rewrite while creating room for non-framework project types.

Key changes needed:

- `AutoConfigDetails` should hold a selected `DetectionCandidate` or equivalent.
- `outputDir` should become optional and adapter-specific.
- Plans should distinguish persistent setup from no-write deploys.
- Detection should preserve original deploy intent separately from Wrangler's current `script`/`assets` interpretation.
- The confirmation prompt should display fields based on `kind` rather than always asking for framework and output directory.
- The summary should show `projectKind`, `adapterId`, generated entrypoint, container image, port, and output directory only when applicable.
- `nodejs_compat` should no longer be added globally.
- `runAutoConfig()` should consume an explicit plan and apply it.
- Telemetry should record `projectKind`, `adapterId`, `confidence`, configured/not configured, and failure stage.

## Detection Pipeline Proposal

A practical detection order:

1. Existing config check. If a non-Pages Wrangler config exists, return already configured, as today.
2. Deployment intent normalization. For deploy commands, preserve the original positional target, its stat result, coarse category, and Wrangler's current interpretation (`script`, `assets`, or none). Do this before adapter selection so detection does not need to reverse-engineer intent from mutated args.
3. Explicit target detector. If the command passed `path`, inspect only that target and use high-confidence adapters. This enables `wrangler deploy index.html` without making every positional argument dangerous, and creates the gated path for Phase 2b folder/app and Phase 3 Express reinterpretation.
4. Single-file/static-folder detector. Treat `index.html`, other safe static assets, and folders with `index.html` as first-class simple deploy candidates.
5. Package static app detector. Detect Vite-family apps and other apps with a clear build command and static output.
6. Container detector. Look for root `Dockerfile` or `Containerfile` as a local prompt candidate.
7. Node server detector. Look for Express/Fastify/Koa/raw HTTP server projects from package dependencies plus source patterns.
8. Existing web framework detector. Keep `@netlify/build-info` and framework registry.
9. Static detector. Use the existing `index.html` output directory heuristic as the fallback for bare `wrangler deploy`.

Confidence guidance:

- A root Dockerfile/Containerfile with an explicit future Cloudflare marker or flag: high confidence.
- Root `Dockerfile` with no Wrangler config: medium confidence locally, prompt only. Do not claim it automatically in non-interactive mode.
- Root `Dockerfile` inside a recognized frontend framework project: low confidence unless user selects it.
- Explicit `wrangler deploy Dockerfile`: high confidence for container setup if we choose to support this syntax.
- Explicit `wrangler deploy index.html`: high confidence for no-write single-file site deploy.
- Explicit `wrangler deploy ./dir` where `dir/index.html` exists: high confidence for static folder deploy.
- Explicit `wrangler deploy ./dir` with `package.json`, a known static build tool, and a build script: medium/high confidence depending on output detection.
- `package.json` has `express` and entry file imports/requires `express`: high confidence.
- `package.json` has `express` but no source patterns: medium confidence.
- `http.createServer(...).listen(...)` in explicit entrypoint: high confidence for Node HTTP server adapter.
- Multiple high-confidence candidates in CI: error and ask for local `wrangler setup` or an explicit flag.

## Simple File First, Then Gated Folder and Static App Deploy

### Why This Is the First Upstreaming Target

The `dply` wrapper shows that the lowest-friction deploy path is not an edge case. It is the first thing people expect:

```sh
wrangler deploy index.html
```

This input is easy to explain, easy to test, and mostly maps to existing Wrangler functionality. It should not require users or agents to learn `--assets`, pick a Worker name, choose a compatibility date, decide whether to write `wrangler.jsonc`, or parse output to find the URL.

The folder and package-app forms are still important, but they are riskier:

- `wrangler deploy ./my-website` already means "deploy this directory as assets" today.
- `wrangler deploy ./my-vite-app` already means "upload this directory as raw assets" today, even if that is often not what the user wanted.
- Changing either behavior can surprise users who rely on today's interpretation.

Therefore `index.html` can be the first unflagged behavior change. Folder and static-app reinterpretation should be behind an explicit rollout gate first, and likely belongs in a major Wrangler release if the default behavior changes broadly.

### Candidate Detection

Support this shape first without a rollout flag:

- A single `.html` file: deploy it as `index.html` in a generated temporary asset directory.

Support these shapes only behind an explicit rollout gate at first:

- A single safe static asset: deploy a generated temporary asset directory with the file and a generated `index.html` linking to it.
- A folder with `index.html`: deploy the folder as static assets.
- A folder with `package.json`, a static-app build script, and a verifiable static output directory: build and deploy the output rather than uploading the whole source tree as raw assets.
- A folder with an existing Wrangler config: treat this as a project-targeting follow-up unless product decides `wrangler deploy ./project` should re-root config discovery.
- A Worker-like `.js`, `.ts`, or `.mjs` file: preserve today's direct Worker deploy behavior. Do not route it through the simple-deploy adapter unless a later high-confidence adapter, such as Express, claims it.
- A Vite-family static app: install dependencies if needed, run the build, and deploy the static output if `dist/index.html` exists.

This should be implemented as adapter detection, not as a pile of special cases in the deploy command. The important distinction is that these adapters can return no-write plans.

### No-Write Plan Shape

For `wrangler deploy index.html`, the plan should be roughly:

```txt
Project Type: single-file site
Source: index.html
Generated Assets Directory: <temporary directory>
Persistent Files: none
Wrangler Invocation: deploy --assets <temporary directory> --name <derived> --compatibility-date <today>
```

The deployed Worker/assets are not temporary. "No-write" only describes local repository behavior: Wrangler may generate temporary working files internally and clean them up, but it does not write `wrangler.jsonc`, move the user's `index.html`, or modify `package.json`.

For the gated future `wrangler deploy ./my-website` path, the plan could be:

```txt
Project Type: static assets
Source: ./my-website
Assets Directory: ./my-website
Persistent Files: none by default
Wrangler Invocation: deploy --assets ./my-website --name <derived> --compatibility-date <today>
```

For a Worker-like file, do nothing in the simple-deploy adapter by default. Wrangler already handles ESM, service-worker format, TypeScript transpilation, and export preservation through the existing build pipeline. The important simple-deploy test is that normal Worker files continue to skip auto-config and deploy exactly as they do today.

### Prompting and Persistence

For `wrangler deploy index.html`, no-write should be the default because persisting config is ambiguous:

- `assets.directory` must point to a directory, not the single file.
- Pointing config at the project root could upload unrelated files on future deploys.
- Creating a durable assets directory would be a more invasive scaffolding action than the user requested.

Recommended behavior:

- Default to no-write deploy with no generated repository files for `index.html`.
- Print the derived name and compatibility date, but do not ask about them unless there is a conflict or invalid derived name.
- Offer persistence as an optional follow-up through `wrangler setup` or the existing interactive config-write prompts. Do not add `--save-config` yet.
- Keep `wrangler setup` as the explicit command for persistent project configuration.

For static folders and package apps, persistence remains a product decision. The gated rollout should compare no-write, prompt-to-save, and setup-first behavior before making either default.

### Authentication and Agent Output

Simple deploy should not change authentication semantics:

- If Wrangler is authenticated, deploy to the user's account.
- If Wrangler is not authenticated, keep today's auth failure or hint. Do not automatically use `--temporary`.
- If the user explicitly passes `--temporary`, continue using the existing temporary preview account flow.
- Print the live URL clearly.
- Include structured output for adapter id, source path category, generated file categories, deploy mode, live URL, and verification status.
- Verify the deployed URL when possible and report the HTTP result.

Agent-readable output matters because many of these deploys will be requested through coding agents. The CLI should not force agents to scrape human prose to find the only URL the user needs.

### Phase 2 Initial Slice

Phase 2 implements:

- `wrangler deploy index.html`.
- Behavior-preserving intent plumbing for positional deploy targets.
- Optional privacy-preserving positional-argument telemetry before broader rollout.
- Structured output updates for live URL, selected adapter, deploy mode, and verification.
- Regression tests proving ordinary Worker script deploys keep the existing path and do not get claimed by simple-deploy detection.

Phase boundary notes:

- Later gated work includes arbitrary static asset single-file previews beyond a small allowlist.
- Later gated work includes unflagged `wrangler deploy ./folder-with-index-html` behavior changes.
- Later gated work includes unflagged `wrangler deploy ./vite-app` behavior changes.
- Later gated work includes complex framework builds and broad dependency installation heuristics.
- Claim URL and temporary-account output behavior stays unchanged.

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
- AST/source pattern: `import express from "express"`.
- AST/source pattern: `const express = require("express")`.
- AST/source pattern: `const app = express()`.
- AST/source pattern: `app.listen(3000)`.
- AST/source pattern: `http.createServer(...)`.
- AST/source pattern: `https.createServer(...)`.
- AST/source pattern: `server.listen(...)`.
- AST/source pattern: `export default app`.
- AST/source pattern: `module.exports = app`.

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
		"enabled": true,
	},
}
```

The `enable_nodejs_http_server_modules` flag is not needed with a generated current compatibility date because docs say it is auto-enabled for compatibility dates `2025-09-01` or later when `nodejs_compat` is enabled. If an adapter preserves a user-provided compatibility date before `2025-09-01`, add the explicit `enable_nodejs_http_server_modules` flag.

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

The snippets above assume the wrapper and app entrypoint are siblings. The real generator must compute relative import specifiers from the generated wrapper path to the detected source path, including root `index.js` imported from `src/worker.ts`.

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

### Phase 3 Initial Slice

Phase 3 implements:

- Express only.
- ESM and CJS imports/requires.
- `app.listen(<number>)` and default-exported app.
- Explicit path and bare deploy modes.
- Generated wrapper, not patching user source.
- `nodejs_compat` and current compatibility date.

Later Node adapter expansions:

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

- Future Cloudflare-specific Dockerfile or Containerfile marker names, if product decides to add them.
- `Dockerfile` at project root.
- `Containerfile` at project root.
- Potential future explicit target: `wrangler deploy Dockerfile`.

Recommended confidence:

- Future Cloudflare-specific Dockerfile and Containerfile marker names: high confidence. These files would intentionally encode deploy-to-Cloudflare behavior.
- Explicit `wrangler deploy Dockerfile` or `wrangler deploy Containerfile`: high confidence once the Containers auto-config gate is enabled.
- `Dockerfile` and `Containerfile` found at the project root: medium-confidence local prompt only because many repos include Dockerfiles for local development, CI, databases, or build tooling.
- In non-interactive mode, do not infer Containers from a root Dockerfile alone. Require an explicit target, explicit flag, or future Cloudflare-specific marker.

### Port Detection

Infer from:

- Dockerfile `EXPOSE` instructions.
- `ENV PORT=...`.
- Known framework defaults only as a weak fallback.
- Container-platform convention: `$PORT` defaults to `80`.

Recommended Cloudflare default:

- If `EXPOSE` is present and single, use it.
- If `EXPOSE` has multiple ports, prompt for the HTTP port.
- If a future Cloudflare-specific Dockerfile marker exists and no `EXPOSE`, default to `80` with a warning because that matches common container-platform expectations.
- If plain `Dockerfile` exists and no `EXPOSE`, prompt locally and use `8080` or `3000` only with explicit user confirmation.

For local dev, Cloudflare docs say `EXPOSE` is important because Wrangler needs to connect to ports locally, even if production does not require it. Auto-config should warn when no `EXPOSE` exists and suggest adding one.

### Generated Worker Code

Generated TypeScript shape:

```ts
import { Container, getContainer } from "@cloudflare/containers";

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
		const container = getContainer(env.APP_CONTAINER);
		return container.fetch(request);
	},
};
```

Generate TypeScript when the project already has TypeScript signals such as `tsconfig.json`, `.ts` source entrypoints, or TypeScript dependencies. Otherwise generate JavaScript without TypeScript annotations.

When a port is inferred or selected, set both `defaultPort` and `envVars.PORT` in the generated Container class so apps that read `$PORT` listen on the same port Wrangler routes to.

Default routing decision: use `getContainer()` for the first Containers rollout.

- `getContainer(env.APP_CONTAINER)` is simplest and safest for cost, but creates one singleton instance by default.
- `getRandom(env.APP_CONTAINER, N)` better matches stateless HTTP service expectations, but requires choosing `N` and can cold-start multiple instances.
- The best long-term DX may be a first-class `getStatelessContainer()` or similar helper that encapsulates routing policy.

Initial Containers recommendation:

- Generate singleton routing with `getContainer(env.APP_CONTAINER)`.
- Generate `max_instances: 1` explicitly rather than relying on Wrangler's hidden normalization default of `20`.
- If the product later promises "stateless autoscaling workloads", prefer a pool with a visible prompt such as "How many container instances should Wrangler route across?" and set `max_instances` to the same number.
- For CI/non-interactive, keep the conservative `max_instances: 1` default unless a config/flag specifies otherwise.

### Generated Wrangler Config

Generated JSONC shape:

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "my-container-app",
	"main": "src/worker.ts",
	"compatibility_date": "2026-07-03",
	"observability": {
		"enabled": true,
	},
	"containers": [
		{
			"name": "my-container-app",
			"class_name": "AppContainer",
			"image": "./Dockerfile",
			"max_instances": 1,
		},
	],
	"durable_objects": {
		"bindings": [
			{
				"name": "APP_CONTAINER",
				"class_name": "AppContainer",
			},
		],
	},
	"migrations": [
		{
			"tag": "v1",
			"new_sqlite_classes": ["AppContainer"],
		},
	],
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
- Containers require Workers Paid plan; warn before writing generated files and before deploy.
- Plain Dockerfile detection may not mean "deploy this as the app"; ask for confirmation.
- If no `EXPOSE`, local dev may fail or need manual port configuration.
- If image is private/remote, guide users to `wrangler containers registries configure`.

### Dashboard/Workers Builds Considerations

Auto-config is also used through Workers Builds automatic PRs when deploy command is exactly `npx wrangler deploy`.

For Containers:

- The generated PR should include `src/worker.ts`, `wrangler.jsonc`, and `package.json` changes.
- The preview deployment environment must have Docker available if it is expected to build a local Dockerfile.
- If Docker is unavailable in Builds, the automatic PR can still be useful, but preview deployment may fail until the build environment supports container image builds.
- Start Containers auto-config as local-only. Dashboard automatic PRs and Workers Builds support should be a separate rollout after Docker availability and product prerequisites are clear.

## Implementation Invariants and Safety Gates

These are the rules a coding agent should treat as non-negotiable while implementing the phases:

- Existing configured Worker projects must remain pass-through. Auto-config should not mutate or repair a project with a real non-Pages Wrangler config unless the user explicitly requests a future repair/setup mode.
- Ordinary Worker script deploys must keep the current path. A `.js`, `.ts`, `.mjs`, or extensionless Worker file should not be claimed by simple-deploy detection unless a later high-confidence adapter such as Express explicitly matches it.
- Positional directory deploys must keep working as assets. The new behavior for a folder with `index.html` should reduce prompt/persistence ceremony, not break the existing assets upload path.
- Explicit-target detection must preserve original intent separately from mutated args. Do not make adapters infer intent only from `args.script` or `args.assets`.
- No-write plans must leave no repository files behind. Temporary generated assets, wrappers, and config should live under Wrangler-managed temporary directories and be cleaned up through existing cleanup paths.
- Persistent plans must be explicit. `wrangler setup` or an accepted prompt can write `wrangler.jsonc`, package scripts, generated wrappers, `.gitignore`, and `.assetsignore`. Do not add `--save-config` until the no-write UX has proven itself.
- `--dry-run` must not install dependencies, write files, build containers, upload assets, deploy Workers, provision temporary accounts, or verify remote URLs. It should still render the selected plan and structured output.
- Telemetry must be shape-only. Record path presence, file/directory category, coarse extension class, current interpretation, adapter id, project kind, confidence, and outcome. Never record raw paths, filenames, URLs, command strings, claim tokens, secrets, package script bodies, or source snippets.
- Structured output should extend existing `autoconfig` and `deploy` entries. Preserve existing output fields and add optional versioned fields rather than changing current meanings.
- Simple deploy must not auto-enable `--temporary`. Temporary-account handling should remain explicit, reuse existing `--temporary` infrastructure, keep refusing authenticated sessions and non-public compliance regions, and never send claim tokens to telemetry.
- Keep claim URL exposure unchanged in this roadmap. Do not add claim URL structured output as part of simple deploy.
- Generated config examples and files must use `wrangler.jsonc`, not TOML.
- Container generated config must use `new_sqlite_classes`, same-Worker Durable Object bindings, matching `containers.class_name`, and an explicit Dockerfile file path such as `"./Dockerfile"`.
- Container generated code and config must agree on routing scale. If code uses a singleton, generated `max_instances` should be `1`; if code uses a pool, generated `max_instances` and the pool size should match.
- Container generated code should set `envVars.PORT` whenever a port is inferred or selected.
- Container generated code should follow project language: TypeScript for TypeScript projects, JavaScript otherwise.
- Container auto-config should start local-only. Dashboard automatic PRs and Workers Builds support are a separate rollout.
- Node HTTP generated configs must include `nodejs_compat`. If the generated compatibility date is before `2025-09-01`, add `enable_nodejs_http_server_modules` or block with a clear warning.
- Compatibility flags should become adapter-owned, while preserving current generated framework behavior during migration.
- Existing Wrangler configs remain pass-through for the first implementation phases. Add future repair/update behavior only behind an explicit `wrangler setup --repair` or `wrangler setup --adapter` style command.
- Each phase must land with focused tests and should be safe to stop after that phase. Do not merge broad detector refactors and Containers behavior in the same change.

## Concrete Test Matrix

Use this as the baseline test coverage checklist. The exact test files can change, but the behaviors should be covered before enabling each phase by default.

| Area                          | Required tests                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current behavior preservation | Existing `deploy/entry-points.test.ts` cases for `wrangler deploy <script>` still skip auto-config and deploy normally.                                                                                                                           |
| Current behavior preservation | Existing explicit directory and `--assets` tests still upload assets and do not run framework auto-config unless the new explicit-target mode intentionally claims the path.                                                                      |
| Argument intent               | Unit tests for `validateDeployVersionsArgs()` or a new intent helper covering file, directory, missing path, `--assets` override, and `--script` directory errors.                                                                                |
| Telemetry                     | If telemetry is added, tests assert positional telemetry contains only coarse categories and never raw target strings, filenames, URLs, claim tokens, or command strings.                                                                         |
| Structured output             | Tests assert existing `deploy` and `autoconfig` output snapshots remain backward-compatible and new optional fields appear only when the new adapter path runs.                                                                                   |
| No-write simple file          | `wrangler deploy index.html --dry-run` selects `single-file-site`, creates no repo files, and emits a plan with generated asset directory category rather than an absolute temp path.                                                             |
| No-write simple file          | `wrangler deploy index.html` uploads a temporary assets directory containing `/index.html`, uses a derived name and compatibility date, and does not write `wrangler.jsonc` by default.                                                           |
| Static folder gated           | Without the rollout gate, `wrangler deploy ./site` where `site/index.html` exists preserves today's assets/prompt behavior. With the gate, it can exercise the lower-ceremony path.                                                               |
| Static folder fallback        | `wrangler deploy ./assets` without `index.html` preserves today's asset deploy and missing-config prompt behavior.                                                                                                                                |
| Static package app gated      | Without the rollout gate, a Vite project directory preserves today's raw-assets interpretation. With the gate, a fixture builds once, deploys `dist/` only when `dist/index.html` exists, and reports a clear error when build output is missing. |
| Normal Worker script          | ESM, service-worker, TypeScript, and extensionless Worker entrypoint tests continue through the existing deployment-bundle pipeline.                                                                                                              |
| Authentication                | Unauthenticated simple deploy does not auto-use `--temporary`; explicit `--temporary` keeps current temporary preview account behavior and does not put claim tokens in telemetry.                                                                |
| URL verification              | Verification is skipped in dry-run, succeeds with a mocked 2xx response, reports non-2xx without hiding the deploy URL, and has timeout/retry tests.                                                                                              |
| Express detection             | Unit tests cover dependency plus AST/source patterns for `import express`, `require("express")`, `app.listen(<number>)`, default-exported app, and false positives.                                                                               |
| Express wrapper               | Generated wrapper imports the detected source using the correct relative specifier for root and `src/` entrypoints.                                                                                                                               |
| Express compatibility         | Generated config includes `nodejs_compat` and handles `enable_nodejs_http_server_modules` correctly for older compatibility dates.                                                                                                                |
| Express negative cases        | Unsupported `upgrade`, direct socket access, unsupported `listen()` signatures, and TLS option patterns warn or block as specified.                                                                                                               |
| Containers detection          | Unit tests cover `Dockerfile`, `Containerfile`, explicit `wrangler deploy Dockerfile`, multiple candidates, and stronger framework candidates.                                                                                                    |
| Containers port inference     | Tests cover `EXPOSE`, multiple `EXPOSE` values, `ENV PORT`, no port, and local vs non-interactive behavior.                                                                                                                                       |
| Containers config             | Generated config includes `main`, `containers`, `durable_objects.bindings`, `migrations.new_sqlite_classes`, explicit Dockerfile path, and matching names/classes.                                                                                |
| Containers deployment         | Wrangler deploy tests with mocked Docker/container APIs prove generated config flows into existing build/push/deploy code without adding a parallel Containers deploy path.                                                                       |
| Dashboard/Builds              | Tests prove local Dockerfile Containers auto-config is local-only in the first rollout and does not run in Dashboard automatic PR/Workers Builds paths.                                                                                           |

## Product/API Prerequisites

Resolved for the next implementation attempt:

1. Keep behavior-preserving deploy intent plumbing. It should preserve original positional target information before Wrangler turns files into `args.script` and directories into `args.assets`.
2. Treat telemetry as optional or scoped. If added, it must be privacy-preserving and shape-only.
3. Make `wrangler deploy index.html` the first unflagged behavior change.
4. Use no-write deploy behavior for `wrangler deploy index.html` by default. This means no repository files are written; the remote deployment itself is a normal deployment.
5. Put static folder and static package-app reinterpretation behind a rollout gate first. Broad default changes may need a major Wrangler release.
6. Do not auto-enable `--temporary`. Unauthenticated deploys should keep today's auth failure or explicit rerun guidance unless the user passes `--temporary`.
7. Keep claim URL output changes outside this roadmap.

Resolved for sequenced implementation phases:

1. Protect folder/static-app reinterpretation with an experimental flag first. Do not use a hidden flag as the main rollout path because users need an explicit opt-in surface and documentation. Keep default behavior unchanged until a major release or strong compatibility evidence.
2. Do not add `--save-config` yet. Keep persistence under `wrangler setup` and existing interactive prompts until `index.html` and gated folder/app deploys prove the UX.
3. Eventually treat explicit `wrangler deploy Dockerfile` or `wrangler deploy Containerfile` as intent to deploy a Container, but only behind the Containers auto-config experimental gate first.
4. Do not infer Containers from a root `Dockerfile` automatically. Treat it as medium-confidence local prompt only, or require an explicit target/flag in CI.
5. Default Container routing to singleton with `getContainer()` for the first Containers rollout.
6. Generate `max_instances: 1` explicitly for the first Containers rollout. Do not rely on Wrangler's hidden default of `20`.
7. Set `envVars.PORT` automatically when a port is inferred or selected.
8. Generate Container Worker code in TypeScript when the project has TypeScript signals; otherwise generate JavaScript.
9. Warn about Workers Paid plan requirements before writing generated files and before deploy.
10. Move `nodejs_compat` insertion to adapter-owned flags, while preserving existing generated framework behavior during migration.
11. Do not update existing Wrangler configs in the first implementation phases. Keep already configured projects pass-through and add future repair/update behavior only through an explicit command.
12. Start Containers auto-config local-only. Dashboard automatic PRs and Workers Builds support should be a separate rollout.

## Phased Implementation Plan

### Phase 0: Lock Product Contract

Decisions already made by this plan:

- `wrangler deploy index.html` is the first unflagged behavior change.
- Folder/static-app reinterpretation uses an experimental rollout gate first.
- No-write deploy is the default for `index.html`; folder/static-app persistence stays under evaluation while gated.
- Telemetry is optional/scoped and must be privacy-preserving if added.
- Explicit `wrangler deploy Dockerfile` can mean Containers only behind the Containers auto-config experimental gate.
- Root `Dockerfile` alone is not enough for non-interactive Containers inference.
- Initial Container rollout uses singleton routing and `max_instances: 1`.
- Container auto-config starts local-only; Dashboard automatic PRs and Workers Builds support are separate rollouts.

Output:

- Short product spec for `index.html`, gated folder/static-app, Express, and Containers flows.
- CLI examples and final generated code/config examples.

### Phase 1: Refactor Auto-Config Core

Goal: make current framework auto-config one adapter family in a broader project-adapter system.

Changes:

- Introduce `ProjectKind`, `DetectionCandidate`, and `ConfigurationPlan` concepts.
- Introduce a deploy intent object that preserves original positional target details separately from `args.script` and `args.assets`.
- Make `outputDir` optional in auto-config details and summary.
- Add no-write plan support for deploys that should not write repository files.
- Move Node compatibility flag insertion from global `runAutoConfig()` into adapters.
- Replace hard-coded confirmation prompts with kind-aware prompts.
- Replace framework-only summary fields with generic summary rendering.
- Add evidence and warning display.
- Add explicit target mode plumbing from `wrangler deploy` to detection.
- Extend existing `autoconfig` structured output with optional project kind, adapter id, confidence, deploy mode, and sanitized source category fields.
- Preserve current framework behavior and snapshots as much as possible.

Tests:

- Existing framework tests should still pass with minimal snapshot changes.
- Add unit tests for no-output-dir candidates.
- Add unit tests for no-write simple-deploy plans.
- Add tests that explicit Worker script deploys still skip auto-config unless a high-confidence adapter matches.
- Add tests that positional intent never emits raw paths or filenames in telemetry.

### Phase 2: Ship `wrangler deploy index.html`

Goal: `wrangler deploy index.html` deploys a single HTML file as a normal remote deployment without treating the file as a Worker script.

Scope:

- Detect single HTML files and deploy them as a generated temporary asset directory.
- Preserve normal Worker-like JS/TS files on the existing Worker script deploy path.
- Default to no-write deploy with no repository file writes.
- Use derived name and current compatibility date without prompting unless needed.
- Do not auto-enable `--temporary`; unauthenticated deploys keep existing auth behavior.
- Verify the deployed URL when possible.
- Add structured output fields for selected adapter, deploy mode, live URL, and verification.

Tests:

- Unit tests for single HTML file detection.
- Unit tests proving folder/package targets are not reinterpreted without the rollout gate.
- Integration tests for `wrangler deploy index.html`.
- Tests that no `wrangler.jsonc` is written by default.
- Tests that normal Worker script deploys still do not run simple-deploy auto-config.
- Tests that unauthenticated deploys do not silently use temporary preview accounts.
- If telemetry is added, tests that only path shape/category is recorded, not raw values.

### Phase 2b: Gate Folder and Static App Reinterpretation

Goal: test lower-ceremony folder and static-app deploy behavior without changing existing positional directory semantics for all users.

Scope:

- Detect folders with `index.html` and deploy them as assets through the gated lower-ceremony path.
- Detect Vite-family static apps, run the build when safe, and deploy `dist/` when `dist/index.html` exists.
- Preserve current behavior by default when the rollout gate is not enabled.
- Keep default behavior unchanged until a major release or strong compatibility evidence.

Tests:

- Integration tests for gated `wrangler deploy ./site`.
- Integration tests for a gated simple Vite app fixture.
- Tests that ungated `wrangler deploy ./site` and `wrangler deploy ./vite-app` keep today's behavior.

### Phase 3: Ship Express/Node Server Adapter

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

### Phase 4: Ship Dockerfile-to-Containers Adapter

Goal: `wrangler deploy` in a project with a Dockerfile can create the Worker shim and config needed for Containers.

Scope:

- Detect future Cloudflare-specific Dockerfile/Containerfile markers if added, plus `Dockerfile` and `Containerfile`.
- Parse `EXPOSE` and `ENV PORT` enough for port inference.
- Prompt for port when needed; use singleton routing and `max_instances: 1` for the first Containers rollout.
- Generate Worker entrypoint with `Container` subclass.
- Install `@cloudflare/containers`.
- Generate `wrangler.jsonc` with `containers`, `durable_objects`, and `migrations`.
- Show Docker/Paid-plan/provisioning warnings.
- Reuse existing deploy pipeline for build and rollout.
- Keep Containers auto-config local-only for the first rollout.

Tests:

- Detector tests for Dockerfile names and confidence.
- Port inference tests for `EXPOSE` variants.
- Tests that explicit `wrangler deploy Dockerfile` is only claimed behind the Containers auto-config gate.
- Tests that root `Dockerfile` alone is not claimed in non-interactive mode.
- Dry-run summary snapshots.
- Generated-code tests for singleton `getContainer()`, `max_instances: 1`, `envVars.PORT`, and TypeScript-vs-JavaScript selection.
- Warning tests for Docker availability and Workers Paid plan messaging before writing files/deploying.
- Wrangler deploy tests with mocked Docker/container APIs proving generated config flows into existing container build/deploy.
- Tests that Dashboard/Builds automatic PR paths do not run local Dockerfile Containers auto-config in the first rollout.
- Negative tests for projects with Dockerfile plus stronger framework detection.

### Phase 5: Expand Software Support

After the abstraction exists, support more "software beyond frameworks":

- Hono as API-only Worker project, replacing current unsupported registry entry.
- Fastify/Koa/h3 Node server adapters.
- Raw `http.createServer()` projects.
- Other containerized stacks through Dockerfile: Rails, Spring Boot, Go, FastAPI, Laravel, ASP.NET, nginx.
- Static asset + API hybrids, with explicit asset strategy.

## Suggested Implementation Order

Recommended order:

1. Refactor just enough to allow no-output-dir adapters, no-write plans, and explicit target detection.
2. Implement unflagged `wrangler deploy index.html`.
3. Implement gated folder/static app reinterpretation and gather confidence before changing defaults.
4. Implement Express auto-config.
5. Use learnings to implement Dockerfile-to-Containers behind an experimental flag or limited high-confidence detection.
6. Graduate Dockerfile support once routing/scaling defaults and Builds behavior are resolved.

Why `index.html` first:

- It directly addresses the reason a thin wrapper exists.
- It is the smallest technical step because it mostly composes existing Wrangler asset deploy behavior.
- It creates the explicit target and no-write plan machinery needed by later app types.
- It gives coding agents a predictable way to get a URL without teaching them Wrangler configuration concepts first.
- It is less risky than folders or package apps because `index.html` is currently treated as a Worker script, which is rarely the user's intent.

Why folders and static apps are gated:

- Positional directories already work today as raw assets.
- Static app detection can require installs/builds and can change which files are uploaded.
- Those defaults are more likely to surprise existing users and may need a major release.

Why Express next:

- It directly addresses a clear user ask.
- It is technically smaller.
- It pressures the exact abstraction issue, `outputDir` being required.
- It avoids premature product promises about Containers autoscaling.

Why Containers after that:

- The lower-level Wrangler deploy path already exists.
- The generated Worker/config shape is clear.
- The remaining uncertainty is mostly DX/product policy, not whether it is technically possible.

## Risks

### Surprising Mutation

Broad detection can be wrong. A root Dockerfile may be for local Postgres, not the app. An `index.js` file may be a normal Worker, not Express. Keep detection confidence visible and prompt locally.

### Backward Compatibility

Current tests assert explicit `wrangler deploy <script>` skips auto-config. Any change here must be narrow and high-confidence to avoid breaking existing workflows.

For `index.html`, the risk is low because today's file-as-script interpretation is almost never useful. For static folders and package apps, the risk is higher because Wrangler already accepts positional directories as assets. Changing those defaults should be gated and backed by tests, release planning, and optional shape-only telemetry.

### Existing Configs

Auto-config currently skips projects with non-Pages Wrangler config. That is safe, but it means "make my existing Express app just work" only applies before config exists. A future `wrangler setup --repair` or `wrangler setup --adapter express` mode may be useful, but should not be part of the first implementation phases.

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
