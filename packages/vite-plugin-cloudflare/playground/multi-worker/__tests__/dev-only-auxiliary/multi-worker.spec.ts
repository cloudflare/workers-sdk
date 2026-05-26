import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import { isBuild, rootDir } from "../../../__test-utils__";

describe.runIf(isBuild)("dev-only auxiliary Worker", () => {
	test("creates output directory for entry worker only", ({ expect }) => {
		expect(
			fs.existsSync(path.join(rootDir, "custom-dev-only-directory", "worker_a"))
		).toBe(true);
		expect(
			fs.existsSync(path.join(rootDir, "custom-dev-only-directory", "worker_b"))
		).toBe(false);
	});

	test("does not include dev-only auxiliary Worker in deploy config", ({
		expect,
	}) => {
		const deployConfigPath = path.join(
			rootDir,
			".wrangler",
			"deploy",
			"config.json"
		);
		const deployConfig = JSON.parse(fs.readFileSync(deployConfigPath, "utf-8"));

		expect(deployConfig.auxiliaryWorkers).toEqual([]);
	});
});
