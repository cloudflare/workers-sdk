import * as path from "node:path";
import { describe, it } from "vitest";
import {
	BUILD_OUTPUT_ROOT,
	BUILD_OUTPUT_VERSION,
	CONFIG_FILENAME,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getSettingsConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	getWorkersDir,
} from "../paths";

describe("path constants", () => {
	it("expose the spec's version and root", ({ expect }) => {
		expect(BUILD_OUTPUT_VERSION).toBe("v0");
		expect(BUILD_OUTPUT_ROOT).toBe(".cloudflare/output");
		expect(CONFIG_FILENAME).toBe("config.json");
		expect(DEFAULT_WORKER_DIRECTORY_NAME).toBe("default");
	});
});

describe("path resolvers", () => {
	const root = path.resolve("/project");
	const outputDir = path.join(root, ".cloudflare", "output", "v0");

	it("resolve the top-level settings config path", ({ expect }) => {
		expect(getSettingsConfigPath(root)).toBe(
			path.join(outputDir, "config.json")
		);
	});

	it("resolve the workers directory", ({ expect }) => {
		expect(getWorkersDir(root)).toBe(path.join(outputDir, "workers"));
	});

	it("resolve the Worker's config, bundle, and assets paths", ({ expect }) => {
		const workerDir = path.join(outputDir, "workers", "default");
		expect(getWorkerConfigPath(root)).toBe(path.join(workerDir, "config.json"));
		expect(getWorkerBundleDir(root)).toBe(path.join(workerDir, "bundle"));
		expect(getWorkerAssetsDir(root)).toBe(path.join(workerDir, "assets"));
	});

	it("resolve paths for a named Worker directory", ({ expect }) => {
		const workerDir = path.join(outputDir, "workers", "additional");
		expect(getWorkerConfigPath(root, "additional")).toBe(
			path.join(workerDir, "config.json")
		);
		expect(getWorkerBundleDir(root, "additional")).toBe(
			path.join(workerDir, "bundle")
		);
		expect(getWorkerAssetsDir(root, "additional")).toBe(
			path.join(workerDir, "assets")
		);
	});

	it("rejects invalid Worker directory names", ({ expect }) => {
		for (const workerDirectoryName of [
			"",
			".",
			"..",
			"nested/worker",
			"nested\\worker",
			"worker\0name",
		]) {
			expect(() => getWorkerConfigPath(root, workerDirectoryName)).toThrow(
				"Worker directory names must be non-empty, single path segments."
			);
		}
	});
});
