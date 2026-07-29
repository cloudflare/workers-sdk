import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test } from "vitest";
import { loadProjectWranglerConfig } from "../config";

describe("loadProjectWranglerConfig", () => {
	let projectPath: string;

	beforeEach(() => {
		projectPath = mkdtempSync(join(tmpdir(), "c3-load-config-"));
	});

	afterEach(() => {
		removeDirSync(projectPath);
	});

	test("returns undefined when no wrangler config exists", ({ expect }) => {
		expect(loadProjectWranglerConfig(projectPath)).toBeUndefined();
	});

	test("loads an existing wrangler.jsonc with its configPath set", ({
		expect,
	}) => {
		writeFileSync(
			join(projectPath, "wrangler.jsonc"),
			JSON.stringify({
				name: "my-worker",
				main: "src/worker.tsx",
				compatibility_date: "2024-01-01",
			})
		);

		const config = loadProjectWranglerConfig(projectPath);

		expect(config).toBeDefined();
		expect(config?.name).toBe("my-worker");
		expect(config?.main).toBe(join(projectPath, "src", "worker.tsx"));
		// `configPath` being set is what causes autoconfig to treat the project as
		// already configured and skip re-configuration.
		expect(config?.configPath).toContain("wrangler.jsonc");
		expect(config?.pages_build_output_dir).toBeUndefined();
	});
});
