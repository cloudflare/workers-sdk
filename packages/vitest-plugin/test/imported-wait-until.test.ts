import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("waitOnExecutionContext() waits for work passed to the waitUntil imported from `cloudflare:workers`", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			main: "./index.ts",
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
			},
		}),
		"index.ts": dedent`
			import { waitUntil } from "cloudflare:workers";

			export const log: string[] = [];

			export default {
				fetch() {
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
			import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
			import { env } from "cloudflare:workers";
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
	expect(await result.exitCode).toBe(0);
	expect(result.stdout).toContain("waits for work passed to the imported waitUntil");
});
