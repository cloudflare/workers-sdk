import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import { getTextResponse, isBuild, rootDir } from "../../__test-utils__";

const WORKER_NAME = "build-output-worker";

function getBuildOutputDir() {
	return path.join(rootDir, ".cloudflare/output/v0/workers", WORKER_NAME);
}

describe("Build Output API", () => {
	test("serves the worker", async ({ expect }) => {
		const response = await getTextResponse("/");
		expect(response).toBe("hello from worker");
	});

	test("serves the text binding response", async ({ expect }) => {
		const response = await getTextResponse("/text-binding");
		expect(response).toBe("hello from text binding");
	});

	test("serves static assets", async ({ expect }) => {
		const response = await getTextResponse("/static.txt");
		expect(response.trim()).toBe("static asset");
	});
});

describe.runIf(isBuild)("Build Output API spec", () => {
	test("emits worker.config.json at the correct location", ({ expect }) => {
		const configPath = path.join(getBuildOutputDir(), "worker.config.json");
		expect(fs.existsSync(configPath)).toBe(true);
	});

	test("emits a bundle/ directory with the entry chunk", ({ expect }) => {
		const configPath = path.join(getBuildOutputDir(), "worker.config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
			manifest: { mainModule: string };
		};
		const entryPath = path.join(
			getBuildOutputDir(),
			"bundle",
			config.manifest.mainModule
		);
		expect(fs.existsSync(entryPath)).toBe(true);
	});

	test("emits an assets/ directory", ({ expect }) => {
		const assetsDir = path.join(getBuildOutputDir(), "assets");
		expect(fs.existsSync(assetsDir)).toBe(true);
	});

	test("strips `entrypoint` in worker.config.json and adds `manifest`", ({
		expect,
	}) => {
		const configPath = path.join(getBuildOutputDir(), "worker.config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
			string,
			unknown
		>;
		expect(config).not.toHaveProperty("entrypoint");
		expect(typeof config.manifest).toBe("object");
		const manifest = config.manifest as Record<string, unknown>;
		expect(typeof manifest.mainModule).toBe("string");
		expect(typeof manifest.modules).toBe("object");
	});

	test("includes every module in `manifest.modules` on disk under bundle/", ({
		expect,
	}) => {
		const configPath = path.join(getBuildOutputDir(), "worker.config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
			manifest: { modules: Record<string, { type: string }> };
		};
		const bundleDir = path.join(getBuildOutputDir(), "bundle");

		for (const moduleName of Object.keys(config.manifest.modules)) {
			const modulePath = path.join(bundleDir, moduleName);
			expect(fs.existsSync(modulePath), modulePath).toBe(true);
		}
	});

	test("includes source maps in `manifest.modules` with type `sourcemap`", ({
		expect,
	}) => {
		const configPath = path.join(getBuildOutputDir(), "worker.config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
			manifest: {
				mainModule: string;
				modules: Record<string, { type: string }>;
			};
		};
		const sourceMapName = `${config.manifest.mainModule}.map`;
		expect(config.manifest.modules[sourceMapName]).toEqual({
			type: "sourcemap",
		});
		const sourceMapPath = path.join(
			getBuildOutputDir(),
			"bundle",
			sourceMapName
		);
		expect(fs.existsSync(sourceMapPath)).toBe(true);
	});

	test("does not emit wrangler.json", ({ expect }) => {
		const wranglerJson = path.join(getBuildOutputDir(), "wrangler.json");
		expect(fs.existsSync(wranglerJson)).toBe(false);
	});

	test("does not write .wrangler/deploy/config.json", ({ expect }) => {
		const deployConfig = path.join(
			rootDir,
			".wrangler",
			"deploy",
			"config.json"
		);
		expect(fs.existsSync(deployConfig)).toBe(false);
	});
});
