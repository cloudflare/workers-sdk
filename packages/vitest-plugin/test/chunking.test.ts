import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

test("chunks large WebSocket messages bi-directionally", async ({
	expect,
	seed,
	vitestRun,
}) => {
	// Check loads module greater than 1 MiB `workerd` limit...
	const bigText = "xyz".repeat(400_000);
	await seed({
		"big.txt": bigText,
		"vitest.config.mts": vitestConfig({
			miniflare: {
				compatibilityDate: "2025-12-02",
				compatibilityFlags: ["nodejs_compat"],
				modulesRules: [{ type: "Text", include: ["**/*.txt"] }],
			},
		}),
		"index.test.ts": dedent`
			import text from "./big.txt";
			import { it } from "vitest";
			it("logs big text", () => {
				console.log(text);
			});
		`,
	});
	// Increase buffer size to allow the `exec` command to receive this large output.
	// If this is not big enough the child process running Vitest will be terminated.
	const result = await vitestRun({ maxBuffer: bigText.length * 2 });
	expect(await result.exitCode, result.stderr).toBe(0);
	// ...and logs it back
	expect(result.stdout).toMatch(bigText);
});
