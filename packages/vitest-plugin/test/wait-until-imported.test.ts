import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("waitOnExecutionContext() waits for work passed to waitUntil imported from cloudflare:workers", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": dedent`
			{
				"name": "test-worker",
				"main": "./index.ts",
				"compatibility_date": "2025-12-02",
				"compatibility_flags": ["nodejs_compat"]
			}
		`,
		"index.ts": dedent`
			import { waitUntil } from "cloudflare:workers";

			export const log: string[] = [];

			export default {
				async fetch() {
					waitUntil(
						new Promise((resolve) => setTimeout(resolve, 100)).then(() => {
							log.push("done");
						})
					);

					return new Response("ok");
				},
			};
		`,
		"index.test.ts": dedent`
			import {
				createExecutionContext,
				env,
				waitOnExecutionContext,
			} from "cloudflare:test";
			import { expect, it } from "vitest";

			import worker, { log } from "./index";

			it("waits for work passed to the imported waitUntil", async () => {
				const ctx = createExecutionContext();

				await worker.fetch(new Request("https://example.com"), env, ctx);

				await waitOnExecutionContext(ctx);

				expect(log).toEqual(["done"]);
			});
		`,
	});

	const result = await vitestRun();

	await expect(result.exitCode).resolves.toBe(0);
	const output = result.stdout + result.stderr;
	expect(output).toContain("waits for work passed to the imported waitUntil");
});
