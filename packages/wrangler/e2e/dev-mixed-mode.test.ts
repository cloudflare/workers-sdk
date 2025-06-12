import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";

describe("wrangler dev - mixed mode", () => {
	const remoteWorkerName = generateResourceName();
	const alternativeRemoteWorkerName = generateResourceName();
	const helper = new WranglerE2ETestHelper();

	beforeAll(async () => {
		await helper.seed(resolve(__dirname, "./seed-files/mixed-mode-workers"));

		await helper.seed({
			"remote-worker.js": dedent/* javascript */ `
					export default {
						fetch() {
							return new Response('Hello from a remote worker (wrangler dev mixed-mode)');
						}
					};
			`,
		});
		await helper.run(
			`wrangler deploy remote-worker.js --name ${remoteWorkerName} --compatibility-date 2025-01-01`
		);
		await helper.seed({
			"alt-remote-worker.js": dedent/* javascript */ `
				export default {
					fetch() {
						return new Response('Hello from an alternative remote worker (wrangler dev mixed-mode)');
					}
				};`,
		});
		await helper.run(
			`wrangler deploy alt-remote-worker.js --name ${alternativeRemoteWorkerName} --compatibility-date 2025-01-01`
		);
	}, 35_000);

	afterAll(async () => {
		await helper.run(`wrangler delete --name ${remoteWorkerName}`);
		await helper.run(`wrangler delete --name ${alternativeRemoteWorkerName}`);
	});

	it("handles both remote and local service bindings at the same time", async () => {
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "local-and-remote-service-bindings.js",
				compatibility_date: "2025-05-07",
				services: [
					{ binding: "LOCAL_WORKER", service: "local-worker", remote: false },
					{
						binding: "REMOTE_WORKER",
						service: remoteWorkerName,
						remote: true,
					},
				],
			}),
		});

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(`
			"LOCAL<WORKER>: Hello from a local worker!
			REMOTE<WORKER>: Hello from a remote worker (wrangler dev mixed-mode)
			"
		`);
	});

	it("allows code changes during development", async () => {
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "simple-service-binding.js",
				compatibility_date: "2025-05-07",
				services: [
					{
						binding: "REMOTE_WORKER",
						service: remoteWorkerName,
						remote: true,
					},
				],
			}),
		});

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			`"REMOTE<WORKER>: Hello from a remote worker (wrangler dev mixed-mode)"`
		);

		const indexContent = await readFile(
			`${helper.tmpPath}/simple-service-binding.js`,
			"utf8"
		);
		await writeFile(
			`${helper.tmpPath}/simple-service-binding.js`,
			indexContent.replace(
				"REMOTE<WORKER>:",
				"The remote worker responded with:"
			),
			"utf8"
		);

		await setTimeout(500);

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			`"The remote worker responded with: Hello from a remote worker (wrangler dev mixed-mode)"`
		);

		await writeFile(
			`${helper.tmpPath}/simple-service-binding.js`,
			indexContent,
			"utf8"
		);

		await setTimeout(500);

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			`"REMOTE<WORKER>: Hello from a remote worker (wrangler dev mixed-mode)"`
		);
	});

	it("handles workers AI alongside a local service binding", async () => {
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "local-service-binding-and-remote-ai.js",
				compatibility_date: "2025-05-07",
				ai: {
					binding: "AI",
				},
				services: [
					{ binding: "LOCAL_WORKER", service: "local-worker", remote: false },
				],
			}),
		});

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(`
			"LOCAL<WORKER>: Hello from a local worker!
			REMOTE<AI>: "This is a response from Workers AI."
			"
		`);
	});

	it("doesn't show any logs from startMixedModeSession()", async () => {
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "ai.js",
				compatibility_date: "2025-05-07",
				ai: {
					binding: "AI",
				},
			}),
		});

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			`""This is a response from Workers AI.""`
		);

		// This should only include logs from the user Wrangler session (i.e. a single list of attached bindings, and only one ready message)
		expect(normalizeOutput(worker.currentOutput)).toMatchInlineSnapshot(`
			"Your Worker has access to the following bindings:
			Binding        Resource      Mode
			env.AI         AI            remote
			[wrangler:info] Ready on http://<HOST>:<PORT>
			▲ [WARNING] AI bindings always access remote resources, and so may incur usage charges even in local dev. To suppress this warning, set \`remote: true\` for the binding definition in your configuration file.
			⎔ Starting local server...
			[wrangler:info] GET / 200 OK (TIMINGS)"
		`);
	});

	describe("shows helpful error logs", () => {
		it("when a remote service binding is not properly configured", async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: "mixed-mode-mixed-bindings-test",
					main: "simple-service-binding.js",
					compatibility_date: "2025-05-07",
					services: [
						{
							binding: "REMOTE_WORKER",
							service: "non-existent-service-binding",
							remote: true,
						},
					],
				}),
			});

			const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

			await worker.waitForReady();

			await vi.waitFor(
				() =>
					expect(worker.currentOutput).toContain(
						"Could not resolve service binding 'REMOTE_WORKER'. Target script 'non-existent-service-binding' not found."
					),
				5_000
			);
		});

		it("when a remote KV binding is not properly configured", async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: "mixed-mode-mixed-bindings-test",
					main: "kv.js",
					compatibility_date: "2025-05-07",
					kv_namespaces: [
						{
							binding: "KV_BINDING",
							id: "non-existent-kv",
							remote: true,
						},
					],
				}),
			});

			const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

			await worker.waitForReady();

			await vi.waitFor(
				() =>
					expect(worker.currentOutput).toContain(
						"KV namespace 'non-existent-kv' is not valid."
					),
				5_000
			);
		});
	});

	describe("multi-worker", () => {
		it("handles both remote and local service bindings at the same time in all workers", async () => {
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: "mixed-mode-mixed-bindings-multi-worker-test",
					main: "local-and-remote-service-bindings.js",
					compatibility_date: "2025-05-07",
					services: [
						{
							binding: "LOCAL_WORKER",
							service: "local-test-worker",
							remote: false,
						},
						{
							binding: "REMOTE_WORKER",
							service: remoteWorkerName,
							remote: true,
						},
					],
				}),
			});
			const localTest = makeRoot();
			await seed(localTest, {
				"wrangler.json": JSON.stringify({
					name: "local-test-worker",
					main: "index.js",
					compatibility_date: "2025-05-07",
					services: [
						{
							// Note: we use the same binding name but bound to a difference service
							binding: "REMOTE_WORKER",
							service: alternativeRemoteWorkerName,
							remote: true,
						},
					],
				}),
				"index.js": dedent`
								export default {
									async fetch(request, env) {
										const remoteWorkerText = await (await env.REMOTE_WORKER.fetch(request)).text();
										return new Response(\`[local-test-worker]REMOTE<WORKER>: \${remoteWorkerText}\`);
									}
								}`,
			});

			const worker = helper.runLongLived(
				`wrangler dev --x-mixed-mode -c wrangler.json -c ${localTest}/wrangler.json`
			);

			const { url } = await worker.waitForReady();

			await expect(fetchText(url)).resolves.toMatchInlineSnapshot(`
				"LOCAL<WORKER>: [local-test-worker]REMOTE<WORKER>: Hello from an alternative remote worker (wrangler dev mixed-mode)
				REMOTE<WORKER>: Hello from a remote worker (wrangler dev mixed-mode)
				"
			`);
		});
	});
});

async function spawnLocalWorker(helper: WranglerE2ETestHelper): Promise<void> {
	const local = makeRoot();
	await seed(local, {
		"wrangler.json": JSON.stringify({
			name: "local-worker",
			main: "index.js",
			compatibility_date: "2025-05-07",
		}),
		"index.js": dedent`
						export default {
							fetch(request) {
									return new Response("Hello from a local worker!");
							}
						}`,
	});
	const localWorker = helper.runLongLived(
		// Note: we use a random port here otherwise for some reason in CI windows
		//       allows the default port to be overridden by other processes
		`wrangler dev --port ${await getPort()}`,
		{ cwd: local }
	);
	await localWorker.waitForReady();
}
