import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test.for([undefined, false] as const)(
	"Workers Vitest uses local Artifacts without credentials (remote=%s)",
	async (remote, { expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig({
				wrangler: { configPath: "./wrangler.jsonc" },
			}),
			"wrangler.jsonc": JSON.stringify({
				name: "artifacts-test-worker",
				main: "./index.ts",
				compatibility_date: "2026-09-03",
				artifacts: [
					{
						binding: "REPOS",
						namespace: "examples",
						...(remote === undefined ? {} : { remote }),
					},
				],
			}),
			"index.ts": dedent`
				export default {
					async fetch(request, env) {
						return Response.json(await env.REPOS.list());
					}
				};
			`,
			"index.test.ts": dedent`
				import { env } from "cloudflare:test";
				import { it } from "vitest";

				it("creates, gets and lists a repository locally", async ({ expect }) => {
					const created = await env.REPOS.create("demo");
					expect(new URL(created.remote).hostname).toBe("127.0.0.1");
					const repo = await env.REPOS.get("demo");
					expect((await repo.info()).name).toBe("demo");
					expect((await env.REPOS.list()).repos).toHaveLength(1);
					expect(await repo.readFile({ ref: "main", path: "missing.txt" })).toBeNull();
				});
			`,
		});

		const result = await vitestRun();
		await expect(result.exitCode, result.stderr).resolves.toBe(0);
	}
);
