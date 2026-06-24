import dedent from "ts-dedent";
import { afterAll, describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";

const TIMEOUT = 60_000;

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

		describe("zero-downtime rename", () => {
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

				expect(output.stdout).not.toContain("Renamed: ");
				expect(output.stdout).not.toContain("Created: ");
			});
		});

		describe("cross-script transfer", () => {
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
				// The target can add the binding after the transfer commits.
				await helperB.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerB}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
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

			it("step 4: target script adds its `Widget` binding now that the transfer has committed", async ({
				expect,
			}) => {
				// The namespace now lives on workerB, so this deploy can add the binding.
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
								"Widget": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class Widget extends DurableObject {}
						export default {
							fetch() { return new Response("target with binding"); },
						};
					`,
				});

				const output = await helperB.run(`wrangler deploy`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain("env.WIDGET (Widget)");
				expect(output.stdout).not.toContain("Created: ");
				expect(output.stdout).not.toContain("Transfer pending: ");
				expect(output.stdout).not.toContain("Transferred (committed): ");
				expect(output.stdout).not.toContain("Deleted: ");
				expect(output.stdout).not.toContain("Renamed: ");
			});
		});

		describe("wrangler versions upload", () => {
			const workerName = generateResourceName();
			const helper = new WranglerE2ETestHelper();
			let versionId: string;

			afterAll(async () => {
				await helper.bestEffortRun(`wrangler delete`);
			});

			it("step 1: bootstrap deploys SomeClass via `exports`", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [{ "name": "DO", "class_name": "SomeClass" }],
							},
							"exports": {
								"SomeClass": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class SomeClass extends DurableObject {}
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

				expect(output.stdout).toContain("Created: SomeClass");
			});

			// TODO: unskip once server-side `exports` support on the
			// versions POST endpoint
			// (POST /accounts/.../workers/scripts/.../versions) is rolled
			// out to production. Today the server returns error 10061
			// (legacy migrations validation) for declarative `exports` on
			// this endpoint — the EWC controller accepts it per
			// do_exports_version_test.go but the production route still
			// reaches a code path that doesn't see the `exports` field.
			// Use `wrangler deploy` to apply `exports`-based lifecycle
			// changes in the meantime.
			it.skip("step 2: `versions upload` stages a new class without running reconciliation", async ({
				expect,
			}) => {
				// Introduce AnotherClass via a draft version. EWC's
				// versions POST controller persists `exports` with
				// SkipDeploy:true, so the reconciliation envelope is
				// NOT emitted at upload time — it runs when the version
				// is subsequently deployed (step 3).
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [
									{ "name": "DO", "class_name": "SomeClass" },
									{ "name": "ANOTHER", "class_name": "AnotherClass" },
								],
							},
							"exports": {
								"SomeClass": { "type": "durable-object", "storage": "sqlite" },
								"AnotherClass": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class SomeClass extends DurableObject {}
						export class AnotherClass extends DurableObject {}
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
				});

				const output = await helper.run(`wrangler versions upload`, {
					env: { ...process.env, X_DO_EXPORTS: "true" },
				});

				expect(output.stdout).toContain("Worker Version ID:");
				expect(output.stdout).not.toContain(
					"Durable Object exports reconciliation"
				);
				expect(output.stdout).not.toContain("Created: AnotherClass");

				versionId = output.stdout.match(
					/Worker Version ID:\s+([a-f\d-]+)/
				)?.[1] as string;
				expect(versionId).toBeTruthy();
			});

			// TODO: unskip alongside step 2 once the server-side rollout
			// completes (see TODO above step 2). Step 3 depends on the
			// versionId captured in step 2, so they unskip together.
			it.skip("step 3: `versions deploy` runs the deferred reconciliation", async ({
				expect,
			}) => {
				const output = await helper.run(
					`wrangler versions deploy ${versionId}@100% --yes`,
					{
						env: { ...process.env, X_DO_EXPORTS: "true" },
					}
				);

				expect(output.stdout).toContain("SUCCESS");
			});

			it("rejects `exports` when `X_DO_EXPORTS` is off on the versions path", async ({
				expect,
			}) => {
				// Symmetric to the deploy-side gate-off coverage above —
				// pin down that the same `assertDoExportsEnabledIfConfigured`
				// validator fires on the versions-upload path.
				const result = await helper.run(`wrangler versions upload`);

				expect(result.status).not.toBe(0);
				expect(result.stderr).toContain(
					"X_DO_EXPORTS` environment variable is not set"
				);
			});
		});
	}
);
