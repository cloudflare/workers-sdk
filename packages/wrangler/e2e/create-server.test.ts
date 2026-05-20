import path from "node:path";
import { setTimeout } from "node:timers/promises";
import dedent from "ts-dedent";
import { beforeEach, describe, it, onTestFinished, vi } from "vitest";
import {
	importWrangler,
	WranglerE2ETestHelper,
} from "./helpers/e2e-wrangler-test";

const { createServer } = await importWrangler();

describe("createServer", { sequential: true }, () => {
	let helper: WranglerE2ETestHelper;

	beforeEach(() => {
		helper = new WranglerE2ETestHelper();
	});

	it("starts with default server options", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "hello-worker",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch(request) {
						if (new URL(request.url).pathname === "/url") {
							return new Response(request.url);
						}
						return new Response("Hello World");
					}
				};
			`,
		});

		const server = createServer({
			workers: [
				{ configPath: path.resolve(helper.tmpPath, "./wrangler.jsonc") },
			],
		});
		onTestFinished(server.close);

		const { url, inspectorUrl } = await server.listen();

		expect(url.protocol).toBe("http:");
		expect(url.hostname).toBe("127.0.0.1");
		expect(Number(url.port)).toBeGreaterThan(0);
		expect(inspectorUrl).toBeUndefined();

		const response1 = await fetch(url);
		await expect(response1.text()).resolves.toBe("Hello World");

		const relativeServerResponse = await server.fetch("/url");
		await expect(relativeServerResponse.text()).resolves.toBe(
			new URL("/url", url).href
		);

		const relativeWorkerResponse = await server.getWorker().fetch("/url");
		await expect(relativeWorkerResponse.text()).resolves.toBe(
			new URL("/url", url).href
		);
	});

	it("support fetching different workers from the same session", async ({
		expect,
	}) => {
		await helper.seed({
			"wrangler.primary.jsonc": dedent`
				{
					"name": "primary-worker",
					"main": "src/primary.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"wrangler.auxiliary.jsonc": dedent`
				{
					"name": "auxiliary-worker",
					"main": "src/auxiliary.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/primary.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello from Primary Worker");
					}
				};
			`,
			"src/auxiliary.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello from Auxiliary Worker");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [
				{ configPath: "./wrangler.primary.jsonc" },
				{ configPath: "./wrangler.auxiliary.jsonc" },
			],
		});
		onTestFinished(server.close);

		await server.listen();

		const defaultServerResponse = await server.fetch("/");
		await expect(defaultServerResponse.text()).resolves.toBe(
			"Hello from Primary Worker"
		);

		const defaultWorkerResponse = await server.getWorker().fetch("/");
		await expect(defaultWorkerResponse.text()).resolves.toBe(
			"Hello from Primary Worker"
		);

		const primaryResponse = await server.getWorker("primary-worker").fetch("/");
		await expect(primaryResponse.text()).resolves.toBe(
			"Hello from Primary Worker"
		);

		const auxiliaryResponse = await server
			.getWorker("auxiliary-worker")
			.fetch("/");
		await expect(auxiliaryResponse.text()).resolves.toBe(
			"Hello from Auxiliary Worker"
		);
	});

	it("supports overriding fetch for outbound requests", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "hello-example",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return fetch("http://example.com");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
			outboundService(request) {
				if (request.url === "http://example.com/") {
					return new Response("Mocked response from example.com");
				}

				throw new Error(`Unexpected outbound request to ${request.url}`);
			},
		});
		onTestFinished(server.close);

		await server.listen();

		const response = await server.fetch("/");
		await expect(response.text()).resolves.toBe(
			"Mocked response from example.com"
		);
	});

	it("does not reload on source changes by default", async ({ expect }) => {
		await helper.seed({
			"wrangler.jsonc": dedent`
				{
					"name": "create-server-test",
					"main": "src/index.ts",
					"compatibility_date": "2026-05-20"
				}
			`,
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Hello World");
					}
				};
			`,
		});

		const server = createServer({
			root: helper.tmpPath,
			workers: [{ configPath: "./wrangler.jsonc" }],
		});
		onTestFinished(server.close);

		await server.listen();

		const response1 = await server.fetch("/");
		await expect(response1.text()).resolves.toBe("Hello World");

		await helper.seed({
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Greeting");
					}
				};
			`,
		});

		// Wait a moment to ensure that if the server were going to reload, it would have done so by now
		await setTimeout(1000);

		const response2 = await server.fetch("/");
		await expect(response2.text()).resolves.toBe("Hello World");

		await server.update((options) => ({ ...options, watch: true }));

		const response3 = await server.fetch("/");
		await expect(response3.text()).resolves.toBe("Greeting");

		await helper.seed({
			"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Bonjour");
					}
				};
			`,
		});

		await vi.waitFor(async () => {
			const response4 = await server.fetch("/");
			expect(await response4.text()).toBe("Bonjour");
		});
	});
});
