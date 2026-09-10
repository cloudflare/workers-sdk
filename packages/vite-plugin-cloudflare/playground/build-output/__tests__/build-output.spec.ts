import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import { getTextResponse, isBuild, rootDir } from "../../__test-utils__";

function getBuildOutputDir() {
	return path.join(rootDir, ".cloudflare/output/v0/workers", "default");
}

function getSettingsConfigPath() {
	return path.join(rootDir, ".cloudflare/output/v0", "config.json");
}

describe("Build Output Specification", () => {
	test("serves the worker", async ({ expect }) => {
		const response = await getTextResponse("/");
		expect(response).toBe("hello from worker");
	});

	test("serves the text binding response", async ({ expect }) => {
		const response = await getTextResponse("/text-binding");
		expect(response).toBe("hello from text binding");
	});

	test("serves the additional module", async ({ expect }) => {
		const response = await getTextResponse("/additional-module");
		expect(response).toBe("hello from additional module\n");
	});

	test("serves static assets", async ({ expect }) => {
		const response = await getTextResponse("/static.txt");
		expect(response.trim()).toBe("static asset");
	});
});

describe.runIf(isBuild)("Build Output Specification files", () => {
	test("emits config.json at the correct location", ({ expect }) => {
		const configPath = path.join(getBuildOutputDir(), "config.json");
		expect(fs.existsSync(configPath)).toBe(true);
	});

	test("emits a bundle/ directory with the entry chunk", ({ expect }) => {
		const configPath = path.join(getBuildOutputDir(), "config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
			manifest: { mainModule: string };
		};
		const entryPath = path.join(
			getBuildOutputDir(),
			"bundle",
			config.manifest.mainModule
		);
		expect(config.manifest.mainModule).toMatch(/^chunks\/index-[\w-]+\.mjs$/);
		expect(fs.existsSync(entryPath)).toBe(true);
	});

	test("emits an assets/ directory", ({ expect }) => {
		const assetsDir = path.join(getBuildOutputDir(), "assets");
		expect(fs.existsSync(assetsDir)).toBe(true);
	});

	test("strips `entrypoint` in config.json and adds `manifest`", ({
		expect,
	}) => {
		const configPath = path.join(getBuildOutputDir(), "config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
			string,
			unknown
		>;
		expect(config).not.toHaveProperty("entrypoint");
		expect(typeof config.manifest).toBe("object");
		const manifest = config.manifest as Record<string, unknown>;
		expect(manifest.type).toBe("partial");
		expect(typeof manifest.mainModule).toBe("string");
		expect(typeof manifest.modules).toBe("object");
	});

	test("includes every module in `manifest.modules` on disk under bundle/", ({
		expect,
	}) => {
		const configPath = path.join(getBuildOutputDir(), "config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
			manifest: { modules: Record<string, { type: string }> };
		};
		const bundleDir = path.join(getBuildOutputDir(), "bundle");

		for (const moduleName of Object.keys(config.manifest.modules)) {
			const modulePath = path.join(bundleDir, moduleName);
			expect(fs.existsSync(modulePath), modulePath).toBe(true);
		}
	});

	test("only includes explicitly typed additional modules in the manifest", ({
		expect,
	}) => {
		const configPath = path.join(getBuildOutputDir(), "config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8")) as {
			manifest: {
				mainModule: string;
				modules: Record<string, { type: string }>;
			};
		};
		const additionalModule = Object.entries(config.manifest.modules).find(
			([moduleName]) =>
				moduleName.includes("additional-module-") && moduleName.endsWith(".txt")
		);
		expect(additionalModule).toBeDefined();
		expect(additionalModule?.[1]).toEqual({ type: "text" });
		expect(config.manifest.modules).not.toHaveProperty(
			config.manifest.mainModule
		);
		expect(Object.keys(config.manifest.modules)).toHaveLength(1);

		const sourceMapName = `${config.manifest.mainModule}.map`;
		expect(config.manifest.modules).not.toHaveProperty(sourceMapName);
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

	test("emits a top-level settings config.json recording the build mode", ({
		expect,
	}) => {
		// This project has no `settings` export, so the settings config carries
		// nothing but the discriminant and the mode `vite build` resolved.
		const contents = JSON.parse(
			fs.readFileSync(getSettingsConfigPath(), "utf-8")
		) as Record<string, unknown>;

		expect(contents).toEqual({ type: "settings", mode: "production" });
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
