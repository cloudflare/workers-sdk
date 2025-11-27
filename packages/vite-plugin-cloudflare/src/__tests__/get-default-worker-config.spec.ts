import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { getDefaultWorkerConfig } from "../workers-configs";

describe("getDefaultWorkerConfig", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vite-plugin-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	test("should return an assets-only config", () => {
		const result = getDefaultWorkerConfig(tempDir);
		expect(result.type).toBe("assets-only");
	});

	test("should derive worker name from package.json name", () => {
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify({ name: "my-awesome-app" })
		);

		const result = getDefaultWorkerConfig(tempDir);
		expect(result.config.name).toBe("my-awesome-app");
		expect(result.config.topLevelName).toBe("my-awesome-app");
	});

	test("should normalize invalid worker names from package.json", () => {
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify({ name: "@scope/my_package_name" })
		);

		const result = getDefaultWorkerConfig(tempDir);
		// underscores become dashes, invalid chars removed
		expect(result.config.name).toBe("scope-my-package-name");
	});

	test("should fall back to directory name when package.json has no name", () => {
		const namedDir = path.join(tempDir, "my-test-project");
		fs.mkdirSync(namedDir);
		fs.writeFileSync(
			path.join(namedDir, "package.json"),
			JSON.stringify({ version: "1.0.0" })
		);

		const result = getDefaultWorkerConfig(namedDir);
		expect(result.config.name).toBe("my-test-project");
	});

	test("should fall back to directory name when no package.json exists", () => {
		const namedDir = path.join(tempDir, "another-project");
		fs.mkdirSync(namedDir);

		const result = getDefaultWorkerConfig(namedDir);
		expect(result.config.name).toBe("another-project");
	});

	test("should set a compatibility date", () => {
		const result = getDefaultWorkerConfig(tempDir);
		expect(result.config.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	test("should have empty nonApplicable sets", () => {
		const result = getDefaultWorkerConfig(tempDir);
		expect(result.nonApplicable.replacedByVite.size).toBe(0);
		expect(result.nonApplicable.notRelevant.size).toBe(0);
	});

	test("should include raw config", () => {
		fs.writeFileSync(
			path.join(tempDir, "package.json"),
			JSON.stringify({ name: "test-worker" })
		);

		const result = getDefaultWorkerConfig(tempDir);
		expect(result.raw.name).toBe("test-worker");
		expect(result.raw.topLevelName).toBe("test-worker");
	});
});
