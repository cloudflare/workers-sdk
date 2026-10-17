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
	// If this is not big enough the child process running Vitest will exit with a SIGINT signal
	// Pin the reporter so the Worker's large console message is emitted to stdout,
	// exercising the return WebSocket frame as well as the module load.
	const result = await vitestRun({
		flags: ["--reporter=default"],
		maxBuffer: bigText.length + 10000,
	});
	await result.exitCode;
	// ...and logs it back
	expect(result.stdout).toMatch(bigText);
	expect(await result.exitCode).toBe(0);
});

test("keeps a large main module graph available across files when imported from setupFiles", async ({
	expect,
	seed,
	vitestRun,
}) => {
	const moduleCount = 3;
	const moduleContents = `export const value = ${JSON.stringify("xyz".repeat(450_000))};`;
	const imports = Array.from(
		{ length: moduleCount },
		(_, index) =>
			`import { value as value${index} } from "./dependency-${index}";`
	).join("\n");
	const totalLength = Array.from(
		{ length: moduleCount },
		(_, index) => `value${index}.length`
	).join(" + ");
	await seed({
		"vitest.config.mts": vitestConfig(
			{ wrangler: { configPath: "./wrangler.jsonc" } },
			{ setupFiles: ["./setup.ts"], fsModuleCache: true }
		),
		"wrangler.jsonc": JSON.stringify({
			name: "large-setup-module-graph",
			main: "src/index.ts",
			compatibility_date: "2025-12-02",
			compatibility_flags: ["nodejs_compat"],
		}),
		"setup.ts": 'import "cloudflare:test";',
		"src/index.ts": `${imports}\nexport default { fetch() { return new Response(String(${totalLength})); } };`,
		...Object.fromEntries(
			Array.from({ length: moduleCount }, (_, index) => [
				`src/dependency-${index}.ts`,
				moduleContents,
			])
		),
		"a.test.ts": dedent`
				import { it } from "vitest";
				it("a", ({ expect }) => {
					expect(1).toBe(1);
				});
			`,
		"b.test.ts": dedent`
				import { it } from "vitest";
				it("b", ({ expect }) => {
					expect(1).toBe(1);
				});
			`,
	});
	const result = await vitestRun({ flags: ["--maxWorkers=1"] });
	expect(await result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
	expect(result.stdout).toContain("Test Files  2 passed (2)");
});
