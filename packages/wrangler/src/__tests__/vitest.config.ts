import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../../vitest.config";

export default mergeConfig(
	configShared,
	defineProject({
		test: {
			name: "wrangler-tests",
			globals: true,
			restoreMocks: true,
			alias: {
				clipboardy: "./helpers/clipboardy-mock.js",
				"miniflare/cli": "../../node_modules/miniflare/dist/src/cli.js",
			},
			setupFiles: ["./vitest.setup.ts"],
			exclude: ["./helpers/**"],
			threads: false,
		},
	})
);
