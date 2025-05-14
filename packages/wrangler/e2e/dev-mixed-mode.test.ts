import dedent from "ts-dedent";
import { describe, expect, it } from "vitest";
import { WranglerE2ETestHelper } from "./helpers/e2e-wrangler-test";
import { fetchText } from "./helpers/fetch-text";
import { makeRoot, seed } from "./helpers/setup";

describe("wrangler dev - mixed mode", () => {
	it("can handle both remote and local service bindings at the same time", async () => {
		const helper = new WranglerE2ETestHelper();
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
									return new Response(\`LOCAL: \${localWorkerText}\\nREMOTE: \${remoteWorkerText}\n\`);
								}
							}`,
		});
		const localWorker = helper.runLongLived("wrangler dev", { cwd: local });
		await localWorker.waitForReady();

		const worker = helper.runLongLived("wrangler dev --x-mixed-mode");

		const { url } = await worker.waitForReady();

		await expect(fetchText(url)).resolves.toMatchInlineSnapshot(`
			"LOCAL: Hello from a local worker!
			REMOTE: Hello World!
			"
		`);
	});
});
