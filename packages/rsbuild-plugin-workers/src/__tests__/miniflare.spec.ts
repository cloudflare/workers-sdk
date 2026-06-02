import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { resolvePluginConfig } from "../config";
import { createMiniflareOptions } from "../miniflare";

describe("createMiniflareOptions", () => {
	test("loads emitted module files instead of Wrangler rule globs", ({
		expect,
	}) => {
		const root = mkdtempSync(join(tmpdir(), "rsbuild-plugin-workers-"));
		const outputDirectory = join(root, "dist/test_worker");
		mkdirSync(outputDirectory, { recursive: true });
		writeFileSync(join(outputDirectory, "index.js"), "export default {};");
		writeFileSync(join(outputDirectory, "chunk.js"), "export const value = 1;");

		const resolvedConfig = resolvePluginConfig(
			{
				config: {
					name: "test-worker",
					main: "src/index.ts",
					compatibility_date: "2025-01-01",
				},
				persistState: false,
			},
			{ root }
		);

		const options = createMiniflareOptions(resolvedConfig, outputDirectory);
		if (!("workers" in options)) {
			throw new Error("Expected multi-worker Miniflare options");
		}
		const worker = options.workers[0];
		if (!worker) {
			throw new Error("Expected a Miniflare worker");
		}

		expect(worker.modules).toEqual(
			expect.arrayContaining([
				{ type: "ESModule", path: "index.js" },
				{ type: "ESModule", path: "chunk.js" },
			])
		);
		expect(worker.modules).not.toContainEqual({
			type: "ESModule",
			path: "**/*.js",
		});
	});
});
