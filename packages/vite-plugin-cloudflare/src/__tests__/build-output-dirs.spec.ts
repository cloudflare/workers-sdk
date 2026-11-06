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

	expect(path.resolve(fixturesPath, clientOutDir ?? "")).toBe(
		getWorkerAssetsDir(fixturesPath)
	);
	expect(path.resolve(fixturesPath, workerOutDir ?? "")).toBe(
		getWorkerBundleDir(fixturesPath)
	);
});
