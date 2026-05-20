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

	describe("watch", () => {
		it("does not reload on source changes by default", async ({ expect }) => {
			await helper.seed({
				"wrangler.jsonc": dedent`
				{
					"name": "create-server-watch-test",
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

			const response1 = await server.fetch("http://dummy");
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

			const response2 = await server.fetch("http://dummy");
			await expect(response2.text()).resolves.toBe("Hello World");
		});

		it(`reloads on source changes when "watch" is set to true`, async ({
			expect,
		}) => {
			await helper.seed({
				"wrangler.jsonc": dedent`
					{
						"name": "create-server-watch-test",
						"main": "src/index.ts",
						"compatibility_date": "2024-09-23"
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
				watch: true,
			});
			onTestFinished(server.close);

			await server.listen();

			let response = await server.fetch("http://dummy");
			await expect(response.text()).resolves.toBe("Hello World");

			await helper.seed({
				"src/index.ts": dedent`
				export default {
					fetch() {
						return new Response("Greeting");
					}
				};
			`,
			});

			await vi.waitFor(async () => {
				response = await server.fetch("http://dummy");
				expect(await response.text()).toBe("Greeting");
			});
		});
	});
});
