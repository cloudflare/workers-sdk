import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	getWorkerAssetsDir,
	getWorkerBundleDir,
} from "@cloudflare/build-output-utils";
import { cloudflare } from "@cloudflare/vite-plugin";
import { removeDirSync } from "@cloudflare/workers-utils";
import { resolveConfig } from "vite";
import { afterEach, beforeEach, describe, test } from "vitest";
import type { Plugin } from "vite";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

test("puts the Build Output directories in the resolved config that other plugins read", async ({
	expect,
}) => {
	let clientOutDir: string | undefined;
	let workerOutDir: string | undefined;

	await resolveConfig(
		{
			root: fixturesPath,
			logLevel: "silent",
			plugins: [
				{
					// Frameworks such as Nuxt read the client output directory here
					name: "read-client-out-dir",
					configResolved(config) {
						clientOutDir = config.environments.client?.build.outDir;
						workerOutDir = config.environments.ssr?.build.outDir;
					},
				},
				cloudflare({ inspectorPort: false, persistState: false }),
			],
		},
		// `serve` rather than `build`, which would clean the shared fixture's Build Output
		"serve"
	);

	expect(clientOutDir).toBe(getWorkerAssetsDir(fixturesPath));
	expect(workerOutDir).toBe(getWorkerBundleDir(fixturesPath));
});

describe("a plugin that moves a Build Output directory", () => {
	// A copy of the fixture, since a build cleans its project's Build Output, which other
	// specs read from the shared fixture
	let root: string;

	beforeEach(() => {
		const casesDir = path.join(fixturesPath, "build-output-dirs");
		fs.mkdirSync(casesDir, { recursive: true });
		root = fs.realpathSync(fs.mkdtempSync(path.join(casesDir, "case-")));
		for (const file of ["cloudflare.config.ts", "index.ts"]) {
			fs.copyFileSync(path.join(fixturesPath, file), path.join(root, file));
		}
	});

	afterEach(() => removeDirSync(root));

	function moveOutDir(environmentName: string): Plugin {
		return {
			name: "move-out-dir",
			configEnvironment: {
				order: "post",
				handler(name) {
					return name === environmentName
						? { build: { outDir: "dist/moved" } }
						: undefined;
				},
			},
		};
	}

	test.for([
		["client", () => getWorkerAssetsDir(root)],
		["ssr", () => getWorkerBundleDir(root)],
	] as const)(
		"fails a build that moves the %s directory",
		async ([environmentName, getRequiredDir], { expect }) => {
			await expect(
				resolveConfig(
					{
						root,
						logLevel: "silent",
						plugins: [
							cloudflare({ inspectorPort: false, persistState: false }),
							moveOutDir(environmentName),
						],
					},
					"build"
				)
			).rejects.toThrow(
				`- "${environmentName}" environment: \`build.outDir\`: ${JSON.stringify(path.join(root, "dist/moved"))} (required: ${JSON.stringify(getRequiredDir())})`
			);
		}
	);

	test("leaves the dev server alone, which doesn't write the Build Output", async ({
		expect,
	}) => {
		await expect(
			resolveConfig(
				{
					root,
					logLevel: "silent",
					plugins: [
						cloudflare({ inspectorPort: false, persistState: false }),
						moveOutDir("client"),
					],
				},
				"serve"
			)
		).resolves.toBeDefined();
	});

	test("accepts the directories it set for a root reached through a symlink", async ({
		expect,
	}) => {
		const link = `${root}-link`;
		fs.symlinkSync(root, link, "junction");
		try {
			await expect(
				resolveConfig(
					{
						root: link,
						logLevel: "silent",
						plugins: [
							cloudflare({ inspectorPort: false, persistState: false }),
						],
					},
					"build"
				)
			).resolves.toBeDefined();
		} finally {
			fs.unlinkSync(link);
		}
	});
});
