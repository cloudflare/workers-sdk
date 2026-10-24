import * as fs from "node:fs";
import * as path from "node:path";
import { InputWorkerSchema, OutputContainerSchema } from "@cloudflare/config";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { describe, test } from "vitest";
import {
	getContainerConfigPath,
	getRootConfigPath,
	getWorkerAssetsDir,
	getWorkerBundleDir,
} from "../paths";
import { readBuildOutput } from "../read";
import {
	cleanBuildOutputDir,
	writeAssets,
	writeContainerConfig,
	writeRootConfig,
	writeWorkerConfig,
} from "../write";

describe("framework-owned Build Output directory", () => {
	runInTempDir();
	const options = { outputDirectory: ".void/cloudflare/output" };

	test("writes and reads one relocatable tree with entry, auxiliary Workers, assets and Containers", async ({
		expect,
	}) => {
		const root = process.cwd();
		await writeRootConfig(
			root,
			{ accountId: "1234567890" },
			{ mode: "production", isPreview: false },
			options
		);
		for (const directoryName of ["default", "auxiliary"]) {
			const bundleDir = getWorkerBundleDir(root, directoryName, options);
			fs.mkdirSync(bundleDir, { recursive: true });
			fs.writeFileSync(path.join(bundleDir, "index.js"), "export default {};");
			await writeWorkerConfig({
				root,
				...options,
				directoryName,
				config: InputWorkerSchema.parse({
					name: directoryName,
					compatibilityDate: "2026-06-01",
					entrypoint: "index.js",
				}),
				manifest: {
					type: "complete",
					mainModule: "index.js",
					modules: { "index.js": { type: "esm" } },
				},
			});
		}
		fs.mkdirSync("public");
		fs.writeFileSync("public/index.html", "hello");
		await writeAssets({
			root,
			sourceDirectory: path.join(root, "public"),
			...options,
		});
		await writeContainerConfig({
			root,
			...options,
			directoryName: "api",
			config: OutputContainerSchema.parse({
				name: "api",
				image: { reference: "registry.example.com/api:latest" },
			}),
		});
		const result = await readBuildOutput(root, options);
		expect(Object.keys(result.workers)).toEqual(["default", "auxiliary"]);
		expect(result.rootConfig.accountId).toBe("1234567890");
		expect(result.containers[0]?.configPath).toBe(
			getContainerConfigPath(root, "api", options)
		);
		expect(
			fs.readFileSync(
				path.join(getWorkerAssetsDir(root, undefined, options), "index.html"),
				"utf8"
			)
		).toBe("hello");
		expect(fs.existsSync(".cloudflare")).toBe(false);
		fs.mkdirSync(".cloudflare/output", { recursive: true });
		fs.writeFileSync(".cloudflare/output/keep", "another build");
		await cleanBuildOutputDir(root, options);
		expect(fs.existsSync(getRootConfigPath(root, options))).toBe(false);
		expect(fs.readFileSync(".cloudflare/output/keep", "utf8")).toBe(
			"another build"
		);
	});

	test("omits nested output when the project root supplies assets", async ({
		expect,
	}) => {
		const root = process.cwd();
		fs.writeFileSync("index.html", "hello");
		await writeAssets({ root, sourceDirectory: root, ...options });
		const assetsDir = getWorkerAssetsDir(root, undefined, options);
		expect(fs.readdirSync(assetsDir)).toContain("index.html");
		expect(fs.existsSync(path.join(assetsDir, ".void"))).toBe(false);
	});

	test("rejects a symlink in an ancestor of custom output", async ({
		expect,
	}) => {
		const root = process.cwd();
		fs.mkdirSync("actual");
		fs.symlinkSync(path.join(root, "actual"), ".void", "junction");
		await expect(readBuildOutput(root, options)).rejects.toThrow(
			"symlink found"
		);
	});
});
