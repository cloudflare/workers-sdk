import assert from "node:assert";
import { setTimeout } from "node:timers/promises";
import { getCloudflareContainerRegistry } from "@cloudflare/containers-shared";
import ci from "ci-info";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, it } from "vitest";
import { CLOUDFLARE_ACCOUNT_ID } from "./helpers/account-id";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { generateResourceName } from "./helpers/generate-resource-name";
import { waitForWorkersDev } from "./helpers/wait-for-workers-dev";

const TIMEOUT = 60_000;
// Deploys that build and push a container image are much slower than a plain
// `wrangler deploy`.
const CONTAINER_DEPLOY_TIMEOUT = 240_000;

// The container deploy tests never *run* a container, but they do have to build
// and push a `linux/amd64` image, which needs Docker. That rules out the hosted
// non-Linux CI runners.
const skipContainerDeployTests =
	Boolean(process.env.LOCAL_TESTS_WITHOUT_DOCKER) ||
	(ci.isCI && process.platform !== "linux");

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

				const output = await helper.run(`wrangler deploy`);

				expect(output.stdout).toContain(
					"Durable Object exports reconciliation"
				);
				expect(output.stdout).toContain("Created: MyDO");
			});

			it("scenario 2: re-deploying with the same config is a no-op", async ({
				expect,
			}) => {
				const output = await helper.run(`wrangler deploy`);

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

				const output = await helper.run(`wrangler deploy`);

				expect(output.stdout).toContain("Deleted: MyDO");
			});

			it("scenario T3: emits a stale-tombstone info and a removable_entries hint", async ({
				expect,
			}) => {
				const output = await helper.run(`wrangler deploy`);

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

				const result = await helper.run(`wrangler deploy`);

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

				const output = await helper.run(`wrangler deploy`);

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

				const output = await helper.run(`wrangler deploy`);

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

				const output = await helper.run(`wrangler deploy`);

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

				const output = await helperA.run(`wrangler deploy`);

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

				const output = await helperB.run(`wrangler deploy`);

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

				const output = await helperA.run(`wrangler deploy`);

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

				const output = await helperB.run(`wrangler deploy`);

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

				const output = await helper.run(`wrangler deploy`);

				expect(output.stdout).toContain("Created: SomeClass");
			});

			// Mirrors the realistic customer flow: stage a new class via
			// `exports` (reached through `ctx.exports`, with NO binding to it
			// yet) on `versions upload`, then add the binding when the version
			// is deployed (step 3). EWC reconciles declarative `exports` at
			// deploy time, so an upload that merely declares a new class — and
			// doesn't bind to it — succeeds without running reconciliation.
			// (A binding to a class declared only in `exports` is instead
			// rejected at upload with code 100406; that path is covered by the
			// versions.upload.test.ts unit tests.)
			it("step 2: `versions upload` stages a new class without running reconciliation", async ({
				expect,
			}) => {
				// Introduce AnotherClass via a draft version, accessed through
				// `ctx.exports.AnotherClass` (no binding). EWC persists
				// `exports` on the new version with reconciliation deferred to
				// deploy, so the reconciliation envelope is NOT emitted at
				// upload time — it runs when the version is deployed (step 3).
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2024-01-01",
							"durable_objects": {
								"bindings": [
									{ "name": "DO", "class_name": "SomeClass" },
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
						// AnotherClass is declared in \`exports\` only (no binding).
						// It becomes reachable via \`ctx.exports.AnotherClass\` once
						// the version is deployed; a binding can be added then.
						export class AnotherClass extends DurableObject {}
						export default {
							fetch() { return new Response("hello"); },
						};
					`,
				});

				const output = await helper.run(`wrangler versions upload`);

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

			// Step 3 depends on the versionId captured in step 2.
			it("step 3: `versions deploy` runs the deferred reconciliation", async ({
				expect,
			}) => {
				const output = await helper.run(
					`wrangler versions deploy ${versionId}@100% --yes`
				);

				expect(output.stdout).toContain("SUCCESS");
			});
		});

		describe("containers attached via `exports`", () => {
			const workerName = generateResourceName();
			const helper = new WranglerE2ETestHelper();

			it("accepts a container that is referenced from a Durable Object export", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2025-04-03",
							"compatibility_flags": ["enable_ctx_exports"],
							"containers": [
								{
									"name": "${workerName}-container",
									"image": "registry.cloudflare.com/hello:world",
									"max_instances": 1,
								},
							],
							"exports": {
								"MyContainerDO": {
									"type": "durable-object",
									"storage": "sqlite",
									"container": "${workerName}-container",
								},
							},
						}
					`,
					"src/index.ts": dedent`
						import { DurableObject } from "cloudflare:workers";
						export class MyContainerDO extends DurableObject {}
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

				const output = await helper.run(`wrangler deploy --dry-run`);

				expect(output.stdout).toContain(
					"The following containers are available:"
				);
				expect(output.stdout).toContain(`${workerName}-container`);
				expect(output.stderr).toBe("");
			});

			it("rejects a container that is not linked to a Durable Object", async ({
				expect,
			}) => {
				await helper.seed({
					"wrangler.jsonc": dedent`
						{
							"name": "${workerName}",
							"main": "src/index.ts",
							"compatibility_date": "2025-04-03",
							"containers": [
								{
									"name": "${workerName}-container",
									"image": "registry.cloudflare.com/hello:world",
									"max_instances": 1,
								},
							],
							"exports": {
								"MyContainerDO": { "type": "durable-object", "storage": "sqlite" },
							},
						}
					`,
				});

				const output = await helper.run(`wrangler deploy --dry-run`);

				expect(output.status).not.toBe(0);
				expect(output.stderr).toContain(
					`The container "${workerName}-container" is not linked to a Durable Object`
				);
			});
		});

		describe.skipIf(skipContainerDeployTests)(
			"containers attached via `exports`: deploy",
			{ timeout: CONTAINER_DEPLOY_TIMEOUT },
			() => {
				const workerName = generateResourceName();
				const containerName = `${workerName}-container`;
				// Push the image up front under a known tag so that it can be deleted
				// again deterministically, and so that neither deploy has to build it.
				const imageTag = `${workerName}:tmp-e2e`;
				const imageUri = `${getCloudflareContainerRegistry()}/${CLOUDFLARE_ACCOUNT_ID}/${imageTag}`;
				const helper = new WranglerE2ETestHelper();

				beforeAll(async () => {
					await helper.seed({
						// A container-free config, so that `containers build` runs before
						// the image it is about to push is referenced by anything.
						"wrangler.jsonc": dedent`
							{
								"name": "${workerName}",
								"main": "src/index.ts",
								"compatibility_date": "2025-04-03",
							}
						`,
						Dockerfile: dedent`
							FROM alpine:latest
							EXPOSE 8080
							CMD ["sleep", "infinity"]
						`,
						"src/index.ts": dedent`
							import { DurableObject } from "cloudflare:workers";

							export class MyContainerDO extends DurableObject {
								async fetch() {
									// \`ctx.container\` is only present when the deployed Worker has a
									// container attached to this class, so this asserts that the API
									// resolved the link between the two.
									return Response.json({ hasContainer: this.ctx.container !== undefined });
								}
							}

							export default {
								async fetch(request, env, ctx) {
									const id = ctx.exports.MyContainerDO.idFromName("container");
									return ctx.exports.MyContainerDO.get(id).fetch(request);
								},
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

					const build = await helper.run(
						`wrangler containers build . -t ${imageTag} -p`
					);
					// Assert here rather than letting the tests below fail on a missing
					// image, so that a broken or missing Docker installation is reported
					// as such instead of as an unrelated assertion in `getDeployedUrl()`.
					assert(
						build.status === 0,
						`Failed to build and push ${imageTag} (exit code ${build.status}):\n${build.stderr}`
					);
					// Give the registry a moment to make the pushed image available.
					await setTimeout(5_000);
				}, CONTAINER_DEPLOY_TIMEOUT);

				afterAll(async () => {
					await helper.bestEffortRun(`wrangler delete`);
					await helper.bestEffortRun(
						`wrangler containers images delete ${imageTag}`
					);
				});

				it("attaches the container to the Durable Object it is referenced from", async ({
					expect,
				}) => {
					await helper.seed({
						"wrangler.jsonc": dedent`
							{
								"name": "${workerName}",
								"main": "src/index.ts",
								"compatibility_date": "2025-04-03",
								"compatibility_flags": ["enable_ctx_exports"],
								"containers": [
									{
										"name": "${containerName}",
										"image": "${imageUri}",
										"max_instances": 1,
									},
								],
								"exports": {
									"MyContainerDO": {
										"type": "durable-object",
										"storage": "sqlite",
										"container": "${containerName}",
									},
								},
							}
						`,
					});

					const output = await helper.run(`wrangler deploy`);

					expect(output.stdout).toContain("Created: MyContainerDO");
					expect(output.stdout).toContain(
						"The following containers are available:"
					);
					expect(output.stdout).toContain(containerName);

					// Wait only for the Durable Object to respond at all, then assert on
					// the payload, so that a missing container fails immediately with a
					// useful diff rather than timing out.
					const response = await waitForWorkersDev(
						getDeployedUrl(output),
						(candidate) =>
							candidate.headers
								.get("content-type")
								?.includes("application/json") === true
					);

					expect(await response.json()).toEqual({ hasContainer: true });
				});

				it("keeps the container attached when the link moves to `class_name`", async ({
					expect,
				}) => {
					await helper.seed({
						"wrangler.jsonc": dedent`
							{
								"name": "${workerName}",
								"main": "src/index.ts",
								"compatibility_date": "2025-04-03",
								"compatibility_flags": ["enable_ctx_exports"],
								"containers": [
									{
										"name": "${containerName}",
										"class_name": "MyContainerDO",
										"image": "${imageUri}",
										"max_instances": 1,
									},
								],
								"exports": {
									"MyContainerDO": { "type": "durable-object", "storage": "sqlite" },
								},
							}
						`,
					});

					const output = await helper.run(`wrangler deploy`);

					expect(output.stdout).toContain(
						"The following containers are available:"
					);

					// Wait only for the Durable Object to respond at all, then assert on
					// the payload, so that a missing container fails immediately with a
					// useful diff rather than timing out.
					const response = await waitForWorkersDev(
						getDeployedUrl(output),
						(candidate) =>
							candidate.headers
								.get("content-type")
								?.includes("application/json") === true
					);

					expect(await response.json()).toEqual({ hasContainer: true });
				});
			}
		);
	}
);

function getDeployedUrl(output: { stdout: string }) {
	const match = output.stdout.match(
		/(?<url>https:\/\/tmp-e2e-.+?\..+?\.workers\.dev)/
	);
	assert(match?.groups);
	return match.groups.url;
}
