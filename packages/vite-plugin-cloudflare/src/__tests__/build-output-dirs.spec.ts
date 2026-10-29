import { fileURLToPath } from "node:url";
import { getWorkerAssetsDir } from "@cloudflare/build-output-utils";
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolveConfig } from "vite";
import { test } from "vitest";

const fixturesPath = fileURLToPath(new URL("./fixtures", import.meta.url));

test("sets the Build Output directories before other plugins' configResolved hooks run", async ({
	expect,
}) => {
	let clientOutDir: string | undefined;

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
					},
				},
				cloudflare({ inspectorPort: false, persistState: false }),
			],
		},
		"build"
	);

	expect(clientOutDir).toBe(getWorkerAssetsDir(fixturesPath));
});
