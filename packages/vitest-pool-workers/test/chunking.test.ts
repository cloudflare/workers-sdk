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
		"vitest.config.mts": dedent`
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
	// Increase buffer size to allow the `exec` command to receive this large output.
	// If this is not big enough the child process running Vitest will exit with a SIGINT signal
	const result = await vitestRun({ maxBuffer: bigText.length + 10000 });
	await result.exitCode;
	// ...and logs it back
	expect(result.stdout).toMatch(bigText);
	expect(await result.exitCode).toBe(0);
});
