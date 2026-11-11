import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	getWorkerAssetsDir,
	getWorkerBundleDir,
} from "@cloudflare/build-output-utils";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolveConfig } from "vite";
import { test } from "vitest";

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
					// Frameworks such as Nuxt read the output directories here
					name: "read-out-dirs",
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

test("overrides user directories and nests child environments in their parent's", async ({
	expect,
}) => {
	const config = await resolveConfig(
		{
			root: fixturesPath,
			logLevel: "silent",
			build: { outDir: "custom" },
			environments: { client: { build: { outDir: "custom-client" } } },
			plugins: [
				cloudflare({
					inspectorPort: false,
					persistState: false,
					viteEnvironment: { childEnvironments: ["child"] },
				}),
			],
		},
		"serve"
	);

	expect(config.environments.client?.build.outDir).toBe(
		getWorkerAssetsDir(fixturesPath)
	);
	expect(config.environments.ssr?.build.outDir).toBe(
		getWorkerBundleDir(fixturesPath)
	);
	expect(config.environments.child?.build.outDir).toBe(
		path.join(getWorkerBundleDir(fixturesPath), "child")
	);
});
