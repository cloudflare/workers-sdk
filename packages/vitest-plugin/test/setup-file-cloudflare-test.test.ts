import dedent from "ts-dedent";
import { test, vitestConfig } from "./helpers";

/**
 * workerd rejects WebSocket messages larger than 32 MiB
 * (`WEBSOCKET_MAX_MESSAGE_SIZE` in `workerd/src/workerd/api/web-socket.c++`).
 * When a setup file imports `cloudflare:test`, Vitest pulls the Worker's whole
 * `main` module graph into every test file's warm module set. With
 * `--maxWorkers=1`, the second test file runs on the same worker, and the pool
 * answers Vitest's `fetchWarmModules` request with a single reply containing
 * the serialized code of every warmed module — one WebSocket message over the
 * limit, which takes workerd down before the file can run.
 *
 * The generated modules total ~40 MB of code, safely above the 32 MiB limit,
 * while each individual module stays well below it so the first test file can
 * still fetch its modules one at a time. See
 * https://github.com/cloudflare/workers-sdk/issues/16331.
 */
const MODULE_COUNT = 128;
const MODULE_SIZE_KB = 320;

function generateMainModules(): Record<string, string> {
	const files: Record<string, string> = {};
	const imports: string[] = [];
	const lengths: string[] = [];
	const blob = "x".repeat(MODULE_SIZE_KB * 1024);
	for (let i = 0; i < MODULE_COUNT; i++) {
		files[`src/module-${i}.ts`] = `export const blob${i} = ${JSON.stringify(blob)};\n`;
		imports.push(`import { blob${i} } from "./module-${i}";`);
		lengths.push(`blob${i}.length`);
	}
	files["src/index.ts"] = `${imports.join("\n")}
export default {
	async fetch() {
		return new Response(String(${lengths.join(" + ")}));
	},
};
`;
	return files;
}

test(
	"runs two test files on one worker when a setup file imports cloudflare:test",
	{ timeout: 600_000 },
	async ({ expect, seed, vitestRun }) => {
		await seed({
			"vitest.config.mts": vitestConfig(
				{
					main: "./src/index.ts",
					miniflare: {
						compatibilityDate: "2025-12-02",
						compatibilityFlags: ["nodejs_compat"],
					},
				},
				{ setupFiles: ["./test/setup.ts"] }
			),
			"test/setup.ts": `import "cloudflare:test";\n`,
			"test/a.test.ts": dedent`
				import { expect, it } from "vitest";

				it("a", () => {
					expect(1).toBe(1);
				});
			`,
			"test/b.test.ts": dedent`
				import { expect, it } from "vitest";

				it("b", () => {
					expect(1).toBe(1);
				});
			`,
			...generateMainModules(),
		});

		const result = await vitestRun({ flags: ["--maxWorkers=1"] });
		const output = result.stdout + result.stderr;
		expect(await result.exitCode, output).toBe(0);
		expect(output).toContain("2 passed");
	}
);
