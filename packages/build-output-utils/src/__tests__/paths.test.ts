import * as path from "node:path";
import { describe, it } from "vitest";
import {
	BUILD_OUTPUT_ROOT,
	BUILD_OUTPUT_VERSION,
	CONTAINER_CONFIG_FILENAME,
	DEFAULT_WORKER_DIRECTORY_NAME,
	getContainerConfigPath,
	getContainerDir,
	getContainersDir,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
	getWorkerConfigPath,
	getWorkersDir,
	normalizeDirectoryName,
	ROOT_CONFIG_FILENAME,
	WORKER_CONFIG_FILENAME,
} from "../paths";

describe("path constants", () => {
	it("expose the spec's version and root", ({ expect }) => {
		expect(BUILD_OUTPUT_VERSION).toBe("v0");
		expect(BUILD_OUTPUT_ROOT).toBe(".cloudflare/output");
		expect(ROOT_CONFIG_FILENAME).toBe("config.json");
		expect(WORKER_CONFIG_FILENAME).toBe("worker.config.json");
		expect(CONTAINER_CONFIG_FILENAME).toBe("container.config.json");
		expect(DEFAULT_WORKER_DIRECTORY_NAME).toBe("default");
	});
});

describe("path resolvers", () => {
	const root = path.resolve("/project");
	const outputDir = path.join(root, ".cloudflare", "output", "v0");

	it("resolves the root config path", ({ expect }) => {
		expect(getRootConfigPath(root)).toBe(path.join(outputDir, "config.json"));
	});

	it("resolves the workers directory", ({ expect }) => {
		expect(getWorkersDir(root)).toBe(path.join(outputDir, "workers"));
	});

	it("resolves Container paths", ({ expect }) => {
		const containersDir = path.join(outputDir, "containers");
		const containerDir = path.join(containersDir, "api-container");
		expect(getContainersDir(root)).toBe(containersDir);
		expect(getContainerDir(root, "api-container")).toBe(containerDir);
		expect(getContainerConfigPath(root, "api-container")).toBe(
			path.join(containerDir, "container.config.json")
		);
	});

	it("resolves the Worker's config, bundle, and assets paths", ({ expect }) => {
		const workerDir = path.join(outputDir, "workers", "default");
		expect(getWorkerConfigPath(root)).toBe(
			path.join(workerDir, "worker.config.json")
		);
		expect(getWorkerBundleDir(root)).toBe(path.join(workerDir, "bundle"));
		expect(getWorkerAssetsDir(root)).toBe(path.join(workerDir, "assets"));
	});

	it("rejects invalid Worker directory names", ({ expect }) => {
		for (const name of [
			"",
			".",
			"..",
			"nested/worker",
			"nested\\worker",
			"worker\0name",
		]) {
			expect(() => getWorkerConfigPath(root, name)).toThrow(
				`Worker directory names must be non-empty, single path segments. Received ${JSON.stringify(name)}.`
			);
		}
	});

	it("rejects invalid Container directory names", ({ expect }) => {
		for (const name of [
			"",
			".",
			"..",
			"nested/container",
			"nested\\container",
			"container\0name",
		]) {
			expect(() => getContainerConfigPath(root, name)).toThrow(
				`Container directory names must be non-empty, single path segments. Received ${JSON.stringify(name)}.`
			);
		}
	});
});

describe("resource directory names", () => {
	it("normalizes resource names to portable directory names", ({ expect }) => {
		expect(normalizeDirectoryName("My_Container")).toBe("my_container");
		expect(normalizeDirectoryName("my-worker")).toBe("my-worker");
		expect(normalizeDirectoryName("My  Container\tName")).toBe(
			"my-container-name"
		);
		expect(normalizeDirectoryName('API:prod?*<>"|')).toBe("api-prod-");
		expect(normalizeDirectoryName("api/prod\\v1")).toBe("api-prod-v1");
		expect(normalizeDirectoryName("api\u0007prod")).toBe("api-prod");
		expect(normalizeDirectoryName("trailing-dots...")).toBe("trailing-dots-");
		expect(normalizeDirectoryName("CON")).toBe("_con");
		expect(normalizeDirectoryName("CON.json")).toBe("_con.json");
		expect(normalizeDirectoryName("LPT².txt")).toBe("_lpt².txt");
	});

	it("truncates resource directory names", ({ expect }) => {
		expect(normalizeDirectoryName("a".repeat(300))).toBe("a".repeat(254));
		expect(normalizeDirectoryName("界".repeat(300))).toBe("界".repeat(84));
		expect(normalizeDirectoryName("😀".repeat(300))).toBe("😀".repeat(63));

		const boundaryPrefix = "a".repeat(251);
		expect(normalizeDirectoryName(`${boundaryPrefix}😀`)).toBe(boundaryPrefix);
		expect(normalizeDirectoryName(`${boundaryPrefix}�`)).toBe(
			`${boundaryPrefix}�`
		);
	});
});
