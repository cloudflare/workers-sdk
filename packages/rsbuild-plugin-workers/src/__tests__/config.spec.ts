import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "vitest";
import { resolvePluginConfig } from "../config";

describe("resolvePluginConfig", () => {
	test("resolves inline worker config", ({ expect }) => {
		const root = mkdtempSync(join(tmpdir(), "rsbuild-plugin-workers-"));
		const resolved = resolvePluginConfig(
			{
				config: {
					name: "inline-worker",
					main: "src/index.ts",
				},
				persistState: false,
			},
			{ root }
		);

		expect(resolved.environmentName).toBe("inline_worker");
		expect(resolved.workerConfig.name).toBe("inline-worker");
		expect(resolved.workerConfig.main).toBe("src/index.ts");
		expect(resolved.persistState).toBe(false);
	});

	test("resolves wrangler config", ({ expect }) => {
		const root = mkdtempSync(join(tmpdir(), "rsbuild-plugin-workers-"));
		writeFileSync(
			join(root, "wrangler.json"),
			JSON.stringify({
				name: "file-worker",
				main: "src/index.ts",
				compatibility_date: "2025-01-01",
			})
		);

		const resolved = resolvePluginConfig(
			{
				configPath: "wrangler.json",
				persistState: false,
			},
			{ root }
		);

		expect(resolved.environmentName).toBe("file_worker");
		expect(resolved.configPath).toBe(join(root, "wrangler.json"));
		expect(resolved.workerConfig.main).toBe("src/index.ts");
	});
});
