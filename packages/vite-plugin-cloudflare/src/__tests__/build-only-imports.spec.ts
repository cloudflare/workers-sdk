import assert from "node:assert";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { readBuildOutput } from "@cloudflare/build-output-utils";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { test } from "vitest";

runInTempDir();

test("builds a Worker with a text module without loading Miniflare", async ({
	expect,
}) => {
	await fs.writeFile(
		"cloudflare.config.ts",
		`export default { worker: {
			name: "build-only",
			entrypoint: "./worker.ts",
			compatibilityDate: "2024-12-30",
		} };`
	);
	await fs.writeFile(
		"worker.ts",
		`import message from "./message.txt";
		export default { fetch() { return new Response(message); } };`
	);
	await fs.writeFile("message.txt", "Hello from a text module");

	const script = `
		import { createBuilder } from "vite";
		import { registerHooks } from "node:module";
		registerHooks({
			resolve(specifier, context, nextResolve) {
				if (specifier === "miniflare" || specifier.startsWith("miniflare/")) {
					throw new Error("Unexpected Miniflare import: " + specifier);
				}
				return nextResolve(specifier, context);
			},
		});
		const { cloudflare } = await import("@cloudflare/vite-plugin");
		const builder = await createBuilder({
			root: process.argv[1],
			configFile: false,
			logLevel: "error",
			plugins: [cloudflare({ types: { includeRuntime: false } })],
		}, null);
		await builder.buildApp();
	`;
	const root = process.cwd();
	await promisify(execFile)(
		process.execPath,
		["--input-type=module", "--eval", script, root],
		{ cwd: path.resolve(import.meta.dirname, "../.."), timeout: 30_000 }
	);

	const { workers } = await readBuildOutput(root);
	const { bundleDir, config } = workers.default;
	const textModule = Object.entries(config.manifest?.modules ?? {}).find(
		([, module]) => module.type === "text"
	);
	assert(bundleDir && textModule, "Expected the build to emit a text module");
	expect(await fs.readFile(path.join(bundleDir, textModule[0]), "utf8")).toBe(
		"Hello from a text module"
	);
});
