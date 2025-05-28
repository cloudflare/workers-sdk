import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout } from "node:timers/promises";
import getPort from "get-port";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCommand } from "./helpers/command";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { generateResourceName } from "./helpers/generate-resource-name";
import { normalizeOutput } from "./helpers/normalize";
import { makeRoot, seed } from "./helpers/setup";

describe("wrangler dev - mixed mode", () => {
	const remoteWorkerName = generateResourceName();
	const alternativeRemoteWorkerName = generateResourceName();

	beforeAll(async () => {
		const tmp = await mkdtemp(`${tmpdir()}/wrangler-dev-mixed-mode-tmp`);
		for (const worker of [
			{
				name: remoteWorkerName,
				content:
					"export default { fetch() { return new Response('Hello from a remote worker (wrangler dev mixed-mode)'); } };",
			},
			{
				name: alternativeRemoteWorkerName,
				content:
					"export default { fetch() { return new Response('Hello from an alternative remote worker (wrangler dev mixed-mode)'); } };",
			},
		]) {
			await writeFile(`${tmp}/index.js`, worker.content);
			runCommand(
				`pnpm dlx wrangler deploy index.js --name ${worker.name} --compatibility-date 2025-01-01`,
				{ cwd: tmp }
			);
		}
	}, 35_000);

	afterAll(() => {
		[remoteWorkerName, alternativeRemoteWorkerName].forEach((worker) => {
			runCommand(`pnpm dlx wrangler delete --name ${worker}`);
		});
	});

	it("handles both remote and local service bindings at the same time", async () => {
		const helper = new WranglerE2ETestHelper();
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "index.js",
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
			"index.js": dedent`
							export default {
								async fetch(request, env) {
									const localWorkerText = await (await env.LOCAL_WORKER.fetch(request)).text();
									const remoteWorkerText = await (await env.REMOTE_WORKER.fetch(request)).text();
									return new Response(\`LOCAL<WORKER>: \${localWorkerText}\\nREMOTE<WORKER>: \${remoteWorkerText}\n\`);
								}
							}`,
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
		const helper = new WranglerE2ETestHelper();
		await spawnLocalWorker(helper);
		const path = await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "index.js",
				compatibility_date: "2025-05-07",
				services: [
					{
						binding: "REMOTE_WORKER",
						service: remoteWorkerName,
						remote: true,
					},
				],
			}),
			"index.js": dedent`
						export default {
							async fetch(request, env) {
								const remoteWorkerText = await (await env.REMOTE_WORKER.fetch(request)).text();
								return new Response(\`REMOTE<WORKER>: \${remoteWorkerText}\`);
							}
						}`,
		});

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
			`"REMOTE<WORKER>: Hello from a remote worker (wrangler dev mixed-mode)"`
		);

		const indexContent = await readFile(`${path}/index.js`, "utf8");
		await writeFile(
			`${path}/index.js`,
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
	});

	it("handles workers AI alongside a local service binding", async () => {
		const helper = new WranglerE2ETestHelper();
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "index.js",
				compatibility_date: "2025-05-07",
				ai: {
					binding: "AI",
				},
				services: [
					{ binding: "LOCAL_WORKER", service: "local-worker", remote: false },
				],
			}),
			"index.js": dedent`
							export default {
								async fetch(request, env) {
									const localWorkerText = await (await env.LOCAL_WORKER.fetch(request)).text();

									const messages = [
										{
											role: "user",
											// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
											content: "Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
										},
									];

									const { response } = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
										messages,
									});

									return new Response(\`LOCAL<WORKER>: \${localWorkerText}\\nREMOTE<AI>: \${response}\n\`);
								}
							}`,
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
		const helper = new WranglerE2ETestHelper();
		await spawnLocalWorker(helper);
		await helper.seed({
			"wrangler.json": JSON.stringify({
				name: "mixed-mode-mixed-bindings-test",
				main: "index.js",
				compatibility_date: "2025-05-07",
				ai: {
					binding: "AI",
				},
			}),
			"index.js": dedent`
							export default {
								async fetch(request, env) {
									const messages = [
										{
											role: "user",
											// Doing snapshot testing against AI responses can be flaky, but this prompt generates the same output relatively reliably
											content: "Respond with the exact text 'This is a response from Workers AI.'. Do not include any other text",
										},
									];

									const { response } = await env.AI.run("@hf/thebloke/zephyr-7b-beta-awq", {
										messages,
									});

									return new Response(\`REMOTE<AI>: \${response}\n\`);
								}
							}`,
		});

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(`
			"REMOTE<AI>: "This is a response from Workers AI."
			"
		`);

		// This should only include logs from the user Wrangler session (i.e. a single list of attached bindings, and only one ready message)
		expect(normalizeOutput(worker.currentOutput)).toMatchInlineSnapshot(`
			"Your Worker has access to the following bindings:
			Binding        Resource      Mode
			env.AI         AI      remote
			[wrangler:info] Ready on http://<HOST>:<PORT>
			▲ [WARNING] Using Workers AI always accesses your Cloudflare account in order to run AI models, and so will incur usage charges even in local development.
			⎔ Starting local server...
			[wrangler:info] GET / 200 OK (TIMINGS)"
		`);
	});

	describe("multi-worker", () => {
		it("handles both remote and local service bindings at the same time in all workers", async () => {
			const helper = new WranglerE2ETestHelper();
			await helper.seed({
				"wrangler.json": JSON.stringify({
					name: "mixed-mode-mixed-bindings-multi-worker-test",
					main: "index.js",
					compatibility_date: "2025-05-07",
					services: [
						{
							binding: "LOCAL_TEST_WORKER",
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
				"index.js": dedent`
								export default {
									async fetch(request, env) {
										const remoteWorkerText = await (await env.REMOTE_WORKER.fetch(request)).text();
										const localTestWorkerText = await (await env.LOCAL_TEST_WORKER.fetch(request)).text();
										return new Response(\`[main-test-worker]REMOTE<WORKER>: \${remoteWorkerText}\\n\${localTestWorkerText}\\n\`);
									}
								}`,
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

			await expect(fetchText(url)).resolves.toMatchInlineSnapshot(
				`
				"[main-test-worker]REMOTE<WORKER>: Hello from a remote worker (wrangler dev mixed-mode)
				[local-test-worker]REMOTE<WORKER>: Hello from an alternative remote worker (wrangler dev mixed-mode)
				"
			`
			);
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
