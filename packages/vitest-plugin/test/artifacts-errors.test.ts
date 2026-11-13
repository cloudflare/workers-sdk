import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

// workerd logs any exception thrown across an RPC boundary as uncaught when it
// runs with `--verbose`, which Workers Vitest enables by default.
test("Workers Vitest does not report caught local Artifacts errors as uncaught", async ({
	expect,
	seed,
	vitestRun,
}) => {
	await seed({
		"vitest.config.mts": vitestConfig({
			wrangler: { configPath: "./wrangler.jsonc" },
		}),
		"wrangler.jsonc": JSON.stringify({
			name: "artifacts-errors-worker",
			main: "./index.ts",
			compatibility_date: "2026-09-03",
			artifacts: [{ binding: "REPOS", namespace: "examples", remote: false }],
		}),
		"index.ts": "export default { fetch() { return new Response(); } };",
		"index.test.ts": dedent`
			import { env } from "cloudflare:test";
			import { it } from "vitest";

			it("throws ArtifactsError in the test isolate", async ({ expect }) => {
				const missing = await env.REPOS.get("missing").catch((error) => error);
				expect(missing).toMatchObject({
					name: "ArtifactsError",
					code: "NOT_FOUND",
					numericCode: 10200,
				});
				const invalid = await env.REPOS.create("-bad").catch((error) => error);
				expect(invalid).toMatchObject({ code: "INVALID_REPO_NAME" });
			});
		`,
	});

	const result = await vitestRun();
	await expect(result.exitCode, result.stderr).resolves.toBe(0);
	expect(result.stdout + result.stderr).not.toContain("uncaught exception");
});
