import dedent from "ts-dedent";
import { describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { makeRoot, seed } from "./helpers/setup";

describe("wrangler dev - mixed mode", () => {
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
						service: "mixed-mode-test-target",
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
			REMOTE<WORKER>: Hello World!
			"
		`);
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
	const localWorker = helper.runLongLived("wrangler dev", { cwd: local });
	await localWorker.waitForReady();
}
