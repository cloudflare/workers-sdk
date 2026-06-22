import dedent from "ts-dedent";
import { afterAll, describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

const TIMEOUT = 60_000;

/**
 * End-to-end coverage of the declarative Durable Object `exports` flow against
 * staging EWC. Runs whenever `CLOUDFLARE_ACCOUNT_ID` is set, matching the
 * standard wrangler e2e pattern.
 *
 * Each invocation sets `X_DO_EXPORTS=true` so wrangler routes the upload
 * through the declarative `exports` flow rather than the legacy `migrations`
 * path.
 *
 * To run locally:
 *
 *   CLOUDFLARE_ACCOUNT_ID=... pnpm --filter wrangler test:e2e durable-objects-exports
 *
 * This flow requires the server-side `exports_reconciliation` account
 * entitlement on the e2e account. Until that entitlement is enabled, the
 * suite is expected to fail at the first upload — that failure is the
 * regression signal that confirms the backend gate isn't yet live.
 *
 * The suite is partitioned into four self-contained describe blocks (each
 * owning its own helper / worker(s) and `afterAll` cleanup) so the stateful
 * deploy sequences within one block can't bleed into another:
 *
 *   - `wrangler deploy` — auto-provision, no-op, delete tombstone, stale
 *     tombstone, and the multi-error envelope returned by code `100402`.
 *   - `wrangler versions upload` — same payload + reconciliation rendering as
 *     `deploy`, exercised on the POST `/versions` path.
 *   - `zero-downtime rename` — three-step rename of `Counter` → `CounterV2`
 *     using a live target + `renamed` tombstone in the same map.
 *   - `cross-script transfer` — two-phase commit handing a namespace from
 *     script A to script B (target's `expecting-transfer` entry first, then
 *     source's `transferred` tombstone).
 *
 * The rename / transfer assertions encode the renderer contract in
 * `packages/deploy-helpers/src/deploy/helpers/exports-reconciliation.ts`.
 * Server scenario tags (e.g. `stale_tombstone`,
 * `config_references_nonexistent_class`) match what EWC surfaces under
 * `info[]` and `errors[]`.
 */

describe.skipIf(!CLOUDFLARE_ACCOUNT_ID)(
	"durable-objects-exports",
	{ timeout: TIMEOUT },
	() => {
		describe("wrangler deploy", () => {
			const workerName = generateResourceName();
			const helper = new WranglerE2ETestHelper();

			afterAll(async () => {
				await helper.bestEffortRun(`wrangler delete`);
			});

			it("scenario 1: auto-provisions a new namespace on first deploy", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "DO", "class_name": "MyDO" }],
							},
							"exports": {
								"MyDO": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class MyDO extends DurableObject {}
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
					"package.json": dedent`
						{
							"name": "${workerName}",
							"version": "0.0.0",
							"private": true
						}
					`,
				});

				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain(
					"Durable Object exports reconciliation"
				);
				expect(output.stdout).toContain("Created: MyDO");
			});

			it("scenario 2: re-deploying with the same config is a no-op", async ({
				expect,
			}) => {
				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				// Scenario 2 — server emits no created/updated/deleted/renamed
				// entries; the renderer therefore emits no reconciliation header.
				expect(output.stdout).not.toContain("Created: ");
				expect(output.stdout).not.toContain("Deleted: ");
			});

			it("scenario T2: processes a deleted tombstone after removing the class from code", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"exports": {
								"MyDO": { "type": "durable-object", "state": "deleted" },
							},
						}
					`,
					"src/index.ts": dedent`
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
				});

				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain("Deleted: MyDO");
			});

			it("scenario T3: emits a stale-tombstone info and a removable_entries hint", async ({
				expect,
			}) => {
				// Deploy again with the same `deleted` tombstone left in config.
				// The namespace is already gone, so reconciliation emits a
				// stale-tombstone info entry and lists MyDO in removable_entries.
				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain("[stale_tombstone] MyDO");
				expect(output.stdout).toContain("Safe to remove from `exports`: MyDO");
			});

			it("scenario 5: rejects exports that declare a class not present in code", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"exports": {
								"Phantom": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
				});

				const result = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(result.status).not.toBe(0);
				expect(result.stderr).toContain(
					"Durable Object exports reconciliation failed"
				);
				expect(result.stderr).toContain(
					"[config_references_nonexistent_class]"
				);
			});
		});

		describe("wrangler versions upload", () => {
			const workerName = generateResourceName();
			const helper = new WranglerE2ETestHelper();

			afterAll(async () => {
				await helper.bestEffortRun(`wrangler delete`);
			});

			it("auto-provisions a new namespace on first version upload", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "DO", "class_name": "MyDO" }],
							},
							"exports": {
								"MyDO": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class MyDO extends DurableObject {}
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
					"package.json": dedent`
						{
							"name": "${workerName}",
							"version": "0.0.0",
							"private": true
						}
					`,
				});

				const output = await helper.run(`wrangler versions upload`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain(
					"Durable Object exports reconciliation"
				);
				expect(output.stdout).toContain("Created: MyDO");
			});

			it("re-uploading the same config is a no-op", async ({ expect }) => {
				const output = await helper.run(`wrangler versions upload`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).not.toContain("Created: ");
				expect(output.stdout).not.toContain("Deleted: ");
			});

			it("rejects exports declaring a class not present in code", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"exports": {
								"Phantom": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
				});

				const result = await helper.run(`wrangler versions upload`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(result.status).not.toBe(0);
				expect(result.stderr).toContain(
					"Durable Object exports reconciliation failed"
				);
				expect(result.stderr).toContain(
					"[config_references_nonexistent_class]"
				);
			});
		});

		describe("zero-downtime rename", () => {
			// Three-step rename, using the `renamed` tombstone state. The
			// validation layer requires the `renamed_to` target ("CounterV2")
			// to also appear as a live (state="created") `durable-object` entry
			// in the same map, so step 2 contains both entries (see
			// `packages/workers-utils/src/config/validation.ts`).
			const workerName = generateResourceName();
			const helper = new WranglerE2ETestHelper();

			afterAll(async () => {
				await helper.bestEffortRun(`wrangler delete`);
			});

			it("step 1: creates the original Counter class", async ({ expect }) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "DO", "class_name": "Counter" }],
							},
							"exports": {
								"Counter": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class Counter extends DurableObject {}
						export default {
							fetch() { return new Response("counter"); },
						};
					`,
					"package.json": dedent`
						{
							"name": "${workerName}",
							"version": "0.0.0",
							"private": true
						}
					`,
				});

				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain("Created: Counter");
			});

			it("step 2: renames Counter → CounterV2 in a single deploy", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "DO", "class_name": "CounterV2" }],
							},
							"exports": {
								"CounterV2": { "type": "durable-object", "storage": "sqlite" },
								"Counter": {
									"type": "durable-object",
									"state": "renamed",
									"renamed_to": "CounterV2",
								},
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class CounterV2 extends DurableObject {}
						export default {
							fetch() { return new Response("counter v2"); },
						};
					`,
				});

				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				// The namespace previously keyed as `Counter` is rewritten to
				// `CounterV2`, so the renderer emits a rename entry and not a
				// `Created:` line for the new class name.
				expect(output.stdout).toContain("Renamed: Counter → CounterV2");
				expect(output.stdout).not.toContain("Created: CounterV2");
			});

			it("step 3: dropping the rename tombstone is a no-op", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "DO", "class_name": "CounterV2" }],
							},
							"exports": {
								"CounterV2": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class CounterV2 extends DurableObject {}
						export default {
							fetch() { return new Response("counter v2"); },
						};
					`,
				});

				const output = await helper.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				// The rename has already been committed server-side, so the
				// deploy reconciles to a clean no-op (no header at all).
				expect(output.stdout).not.toContain("Renamed: ");
				expect(output.stdout).not.toContain("Created: ");
			});
		});

		describe("cross-script transfer", () => {
			// Two-phase commit (see DurableObjectExport docs in
			// `packages/workers-utils/src/config/environment.ts`):
			//   1. Target script (B) deploys an `expecting-transfer` state
			//      entry with `transfer_from = "<sourceScript>"`; reconciliation
			//      emits a `Transfer pending:` info entry because A hasn't
			//      released the namespace yet.
			//   2. Source script (A) deploys a `transferred` tombstone naming B
			//      as `transferred_to`; reconciliation emits
			//      `Transferred (committed):` once the handoff lands.
			const workerA = generateResourceName();
			const workerB = generateResourceName();
			const helperA = new WranglerE2ETestHelper();
			const helperB = new WranglerE2ETestHelper();

			afterAll(async () => {
				await helperA.bestEffortRun(`wrangler delete`);
				await helperB.bestEffortRun(`wrangler delete`);
			});

			it("step 1: source script provisions Widget", async ({ expect }) => {
				await helperA.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerA}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "WIDGET", "class_name": "Widget" }],
							},
							"exports": {
								"Widget": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class Widget extends DurableObject {}
						export default {
							fetch() { return new Response("source"); },
						};
					`,
					"package.json": dedent`
						{
							"name": "${workerA}",
							"version": "0.0.0",
							"private": true
						}
					`,
				});

				const output = await helperA.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain("Created: Widget");
			});

			it("step 2: target script deploys expecting-transfer → Transfer pending", async ({
				expect,
			}) => {
				await helperB.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerB}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "WIDGET", "class_name": "Widget" }],
							},
							"exports": {
								"Widget": {
									"type": "durable-object",
									"state": "expecting-transfer",
									"storage": "sqlite",
									"transfer_from": "${workerA}",
								},
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class Widget extends DurableObject {}
						export default {
							fetch() { return new Response("target"); },
						};
					`,
					"package.json": dedent`
						{
							"name": "${workerB}",
							"version": "0.0.0",
							"private": true
						}
					`,
				});

				const output = await helperB.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain(
					`Transfer pending: Widget ← ${workerA}`
				);
			});

			it("step 3: source script commits the tombstone → Transferred (committed)", async ({
				expect,
			}) => {
				await helperA.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerA}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"exports": {
								"Widget": {
									"type": "durable-object",
									"state": "transferred",
									"transferred_to": "${workerB}",
								},
							},
						}
					`,
					"src/index.ts": dedent`
						export default {
							fetch() { return new Response("source after transfer"); },
						};
					`,
				});

				const output = await helperA.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain(
					`Transferred (committed): Widget → ${workerB}`
				);
			});
		});
	}
);
