import { writeFile } from "node:fs/promises";
import { describe, it } from "vitest";
import { SvelteKit } from "../../../autoconfig/frameworks/sveltekit";
import { NpmPackageManager } from "../../../package-manager";
import { runInTempDir } from "../../helpers/run-in-tmp";

function getBaseOptions() {
	return {
		projectPath: process.cwd(),
		workerName: "my-sveltekit-app",
		outputDir: "build",
		dryRun: true,
		packageManager: NpmPackageManager,
		isWorkspaceRoot: false,
	};
}

describe("SvelteKit framework configure()", () => {
	runInTempDir();

	it("returns the Workers Assets wranglerConfig", async ({ expect }) => {
		const framework = new SvelteKit({ id: "sveltekit", name: "SvelteKit" });
		const result = await framework.configure(getBaseOptions());

		expect(result.wranglerConfig).toEqual({
			main: ".svelte-kit/cloudflare/_worker.js",
			assets: {
				binding: "ASSETS",
				directory: ".svelte-kit/cloudflare",
			},
		});
	});

	it("generates types before the first build when tsconfig.json exists", async ({
		expect,
	}) => {
		await writeFile("tsconfig.json", "{}");

		const framework = new SvelteKit({ id: "sveltekit", name: "SvelteKit" });
		const result = await framework.configure({
			...getBaseOptions(),
			buildCommand: "npm run build",
		});

		expect(result.buildCommandOverride).toBe(
			"npx wrangler types && npm run build"
		);
	});

	it("generates types before the first build when jsconfig.json exists", async ({
		expect,
	}) => {
		await writeFile("jsconfig.json", "{}");

		const framework = new SvelteKit({ id: "sveltekit", name: "SvelteKit" });
		const result = await framework.configure({
			...getBaseOptions(),
			buildCommand: "npm run build",
		});

		expect(result.buildCommandOverride).toBe(
			"npx wrangler types && npm run build"
		);
	});

	it("does not override the build command without a type config", async ({
		expect,
	}) => {
		const framework = new SvelteKit({ id: "sveltekit", name: "SvelteKit" });
		const result = await framework.configure({
			...getBaseOptions(),
			buildCommand: "npm run build",
		});

		expect(result.buildCommandOverride).toBeUndefined();
	});

	it("does not override the build command when no build command was detected", async ({
		expect,
	}) => {
		await writeFile("tsconfig.json", "{}");

		const framework = new SvelteKit({ id: "sveltekit", name: "SvelteKit" });
		const result = await framework.configure(getBaseOptions());

		expect(result.buildCommandOverride).toBeUndefined();
	});
});
