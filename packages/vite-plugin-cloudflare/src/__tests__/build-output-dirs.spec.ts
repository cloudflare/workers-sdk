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
