import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

const runId = process.env.VITEST_CONTAINER_RUN_ID?.replaceAll(
	/[^a-zA-Z0-9-]/g,
	""
);

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
			}),
		],
		test: {
			include: ["test/container.test.ts"],
			name: runId === undefined ? "container-app" : `container-app-${runId}`,
		},
	})
);
