# Develop with local Artifacts

## Prerequisite: Git

This first version of the local Artifacts emulator requires Git 2.32 or newer installed globally on your development machine, with `git` available on the PATH of the process starting Wrangler, Vite, or Workers Vitest. Run `git --version` in that environment before starting the dev server or tests. If Git is missing, cannot run, or is older than 2.32, local Artifacts fails at startup with installation or upgrade instructions instead of waiting for a repository operation. Restart your dev tool after installing Git so it picks up the updated PATH.

Git 2.32 provides `GIT_CONFIG_GLOBAL`, which the emulator uses to isolate host Git settings. Use an up-to-date, security-patched release.

A binding with `"remote": true` does not start the local emulator and does not need local Git, unless remote bindings are disabled (see below). Production Artifacts also does not require Git on your machine. We plan to open-source a JavaScript Git engine in the future; it is not part of this initial local release, which uses native Git.

## Configure a binding

For a Wrangler project, add an Artifacts binding to `wrangler.jsonc`:

```jsonc
{
	"name": "example-worker",
	"main": "src/index.ts",
	"compatibility_date": "2026-09-03",
	"artifacts": [{ "binding": "REPOS", "namespace": "examples" }],
}
```

With `@cloudflare/vite-plugin`, configure the binding in `cloudflare.config.ts`. There, `remote` is nested under `dev`, unlike Wrangler's top-level `"remote"`:

```ts
import { bindings, defineConfig } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "example-worker",
		entrypoint: "./src/index.ts",
		compatibilityDate: "2026-09-03",
		env: {
			REPOS: bindings.artifacts({ namespace: "examples" }),
		},
	},
});
```

In Workers Vitest, point `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` at the Wrangler config above, or `cloudflareTest({ config: true })` at `cloudflare.config.ts`. These paths share the Miniflare implementation.

Artifacts bindings use the local emulator by default in Wrangler, Vite and Workers Vitest, like KV, R2 and D1. Set `remote: true` (`dev: { remote: true }` in `cloudflare.config.ts`) to use deployed repos instead, with the credentials required by your tool. Artifacts used to default to deployed repos, so while `remote` is omitted, `wrangler dev`, `getPlatformProxy()` and Vite warn once for each binding, not on every config reload, that the binding uses the local simulator; set `remote: false` to silence the warning. When remote bindings are disabled (`wrangler dev --local`, or Vite's `remoteBindings: false`), every Artifacts binding uses the local emulator. Do not rely on production repositories being available locally.

A Worker can create and inspect a local repository:

```ts
const created = await env.REPOS.create("demo");
const repo = await env.REPOS.get("demo");
const listing = await env.REPOS.list();
const info = await repo.info();
// created.remote is a loopback HTTP Git URL; created.token is a secret.
```

To use Git smart HTTP, use the returned `remote` URL and a repository token. If `git clone` prompts for a username and password, enter any username (for example, `git`) and use `created.token` as the password. This is an Artifacts repository token, **not** a GitHub or Cloudflare account password. A configured Git credential helper may remember a password entered at the prompt. To avoid that, supply a bearer token for one Git command without storing it in source or in a Git remote URL:

```sh
read -s REPO_TOKEN # Paste the token returned by create(); input is hidden.
printf '\n'
# Replace the URL with the `remote` value returned by create() or info().
GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader \
  GIT_CONFIG_VALUE_0="Authorization: Bearer $REPO_TOKEN" \
  git clone 'http://127.0.0.1:<port>/git/examples/demo.git'
unset REPO_TOKEN
```

After pushing `hello.txt` to `main`, read it in the Worker with `await repo.readFile({ ref: "main", path: "hello.txt" })` (a `Blob`, or `null` when absent). The initial create token permits writes. Its plaintext is returned only once; if you lose it, use `repo.createToken("read")` for cloning or `repo.createToken("write")` for pushing and save the returned `plaintext` securely. Revoke tokens that are no longer needed. Avoid printing tokens or committing them to config. A plain request without a token cannot clone a private local repository. The dev tool prints the Git remote prefix for each namespace at startup. Its loopback port is recorded with the persisted state, so clones keep working across restarts; if another process has taken that port, a new one is chosen and printed, and `info()` returns the new URL.

## Receive repository events

Local namespaces publish the documented [Artifacts events](https://developers.cloudflare.com/artifacts/guides/event-subscriptions/) when you create, import, fork, or delete a repository, and when you create or revoke a repository token. Creation, import, and fork also publish a token-created event for the initial repository token. Push, clone, and fetch events are not yet published locally. Local support does not establish which events are available for each deployed subscription destination. Each delivery has the deployed message shape (`type`, `source`, `payload`, and `metadata`). Locally, `metadata.accountId` is `"local"`, and `metadata.eventSubscriptionId` stays the same while the subscription's configuration does. Identical subscriptions deliver separate copies with distinct IDs.

### Start a Workflow

Use the same `triggers.events` configuration you deploy. Each target must be a Workflow defined by the same Worker. A matching event starts a Workflow instance, and the event message is its `event.payload`:

```jsonc
{
	"name": "example-worker",
	"main": "src/index.ts",
	"compatibility_date": "2026-09-03",
	"artifacts": [
		{ "binding": "REPOS", "namespace": "examples", "remote": false },
	],
	"workflows": [
		{
			"binding": "ON_REPO_CREATED",
			"name": "on-repo-created",
			"class_name": "OnRepoCreated",
		},
	],
	"triggers": {
		"events": [
			{
				"type": "cf.artifacts.repo.created",
				"filter": { "namespace": "examples" },
				"targets": [{ "type": "workflow", "workflow_name": "on-repo-created" }],
			},
		],
	},
}
```

```ts
import { WorkflowEntrypoint } from "cloudflare:workers";
// Declare the fields this Workflow consumes in your application.
// No dependency on the development-only Miniflare package is needed.
export interface RepoCreated {
	type: "cf.artifacts.repo.created";
	source: { type: "artifacts"; namespace: string; repoName: string };
	payload: { repoId: string };
}

export class OnRepoCreated extends WorkflowEntrypoint<Env, RepoCreated> {
	async run(event, step) {
		const { source, payload } = event.payload;
		await step.do("bootstrap repository", async () => {
			const repo = await this.env.REPOS.get(source.repoName);
			return { repoId: payload.repoId, info: await repo.info() };
		});
	}
}
```

Wrangler and Workers Vitest continue to read `triggers.events` from `wrangler.jsonc`. For native `cloudflare.config.ts` projects (including `cf`, Vite, and Workers Vitest), declare events directly on the Workflow export:

```ts
import { bindings, defineConfig, exports } from "@cloudflare/config";

export default defineConfig({
	worker: {
		name: "example-worker",
		entrypoint: "./src/index.ts",
		compatibilityDate: "2026-09-03",
		env: {
			REPOS: bindings.artifacts({
				namespace: "examples",
				dev: { remote: false },
			}),
		},
		exports: {
			OnRepoCreated: exports.workflow({
				name: "on-repo-created",
				events: [
					{
						type: "cf.artifacts.repo.created",
						filter: { namespace: "examples" },
					},
				],
			}),
		},
	},
});
```

There is no separate target: the Workflow declaring an event receives it. The export key names the Worker's `WorkflowEntrypoint` class. A binding to a Workflow in another Worker cannot declare events for that Workflow.

Both configuration formats use the same Worker implementation above. Native-to-Wrangler conversion generates `triggers.events` with targets derived from the owning Workflow, preserving any cron triggers. `cf migrate` performs the reverse: it attaches each legacy event subscription to its matching Workflow export, creating exports from local `workflows` bindings when necessary. Subscriptions without a string `type`, an object `filter`, or any targets, and missing, external, or ambiguous targets, produce a blocking migration follow-up rather than silently losing subscriptions. `cf migrate` does not check event types or filter values; Wrangler already rejects unsupported ones. `wrangler dev` rejects a target this Worker does not define, as `wrangler deploy` does.

Miniflare consumes native Workflow exports directly. Wrangler's legacy `workflows` bindings carry their events in Miniflare's binding-only `unsafeConfig.events`, alongside `unsafeConfig.limits`; this is an adapter detail, not a second public native configuration format. Every declaration Miniflare receives is a separate subscription, so Wrangler gives each event to one declaration: the Workflow export when there is one, otherwise the Worker's first binding to that Workflow.

Local delivery is unordered: events from consecutive operations (including repository creation and its initial token) may arrive in either order. Do not infer production ordering guarantees from the emulator.

Delivery happens after the repository change commits and does not fail the repository operation. A failed delivery is logged and not retried by the publisher. Local Artifacts-to-queue delivery is not supported by this feature; queue subscription configuration is outside this change's scope.

## Storage and network boundaries

Local repositories and metadata persist under the dev tool's Miniflare resource persistence path (for example, Wrangler's `.wrangler/state/` when persistence is enabled). Use the same project root and persistence settings to keep local data across reloads and restarts. Disabling persistence (for example, Vite's `persistState: false`) makes the data temporary. Local and deployed Artifacts are separate: local create, push, and delete operations do not update remote resources. To opt in to a remote binding, set `"remote": true` on that Artifacts binding (`dev: { remote: true }` in `cloudflare.config.ts`) and configure the credentials required by your development tool. Remote mode uses a Cloudflare proxy, not the local Git store; do not assume local data migrates to it.

To reset local state, stop the dev server first, back up any repositories you need, then delete the `artifacts/` directory inside that dev tool's resource persistence path. Do not delete unrelated binding data in the same persistence directory.

A local binding does not contact Cloudflare for repository operations. **Explicit imports from HTTPS Git sources are different:** they make outbound network requests from your development machine to the supplied host, including private-network hosts. Import does not follow HTTP redirects; supply the final HTTPS Git URL so credentials cannot be redirected to another destination. Imports can require authentication and may fail due to TLS certificates, connectivity, or upstream Git permissions. For a private Git CA, set `GIT_SSL_CAINFO` to the trusted CA file in the dev tool's host environment before starting the dev server. Do not disable certificate verification. After a successful import, URL credentials are omitted from the local repository metadata and Git config. In-flight process-crash recovery is not yet validated; treat partial local storage after an interrupted import as sensitive if the URL contained credentials. Treat the import URL as a secret while calling `import()` and avoid logging it. Avoid importing untrusted or private URLs in examples or tests. No remote resources are contacted by the local-only examples above.

## Troubleshooting and limits

- If startup says local Artifacts requires Git, install Git globally, check `git --version` in the dev tool's environment, and restart the tool with `git` on PATH.
- If Git asks for a username and password, use any username and the repository token as the password. If Git reports unauthorized, check the repository, scope, expiry, and revocation; do not use a Cloudflare or GitHub account password.
- If startup reports `Address already in use`, the dev or inspector port may be occupied. Pass `--port=0 --inspector-port=0` and use the printed `Ready on` URL.
- If a Git URL stops responding after restart, another process probably holds its port. Get the new `remote` from the binding or the startup log, and update your clone with `git remote set-url origin <remote>`.
- As in production, a push that contains a file larger than 32 MiB is rejected, and reading such a file throws an `ArtifactsError` with code `MEMORY_LIMIT`.
- `listTokens()` lists active tokens first, then revoked and expired tokens with their `state`. Each repository keeps its 100 most recent inactive tokens. `revokeToken()` returns `false` for an expired token.
- Local development is not a replica of production placement or infrastructure. The local Git endpoint is HTTP on loopback only, and local state and tokens do not transfer to a remote namespace.
