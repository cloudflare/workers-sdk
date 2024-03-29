import dedent from "ts-dedent";
import { test } from "./helpers";

test("chunks large WebSocket messages bi-directionally", async ({
	expect,
	seed,
	vitestRun,
}) => {
	// Check loads module greater than 1 MiB `workerd` limit...
	const bigText = "xyz".repeat(400_000);
	await seed({
		"big.txt": bigText,
		"vitest.config.ts": dedent`
			import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
			export default defineWorkersConfig({
					test: {
						poolOptions: {
							workers: {
								singleWorker: true,
								miniflare: {
									compatibilityDate: "2024-01-01",
									compatibilityFlags: ["nodejs_compat"],
									modulesRules: [
										{ type: "Text", include: ["**/*.txt"] }
									]
								},
							},
						},
					}
			});
		`,
		"index.test.ts": dedent`
			import text from "./big.txt";
			import { it } from "vitest";
			it("logs big text", () => {
				console.log(text);
			});
		`,
	});
	const result = await vitestRun();
	expect(await result.exitCode).toBe(0);

	// ...and logs it back
	expect(result.stdout).toMatch(bigText);
});
