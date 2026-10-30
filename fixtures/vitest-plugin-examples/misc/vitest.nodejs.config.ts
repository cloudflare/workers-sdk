import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				config: "./cloudflare.nodejs.config.ts",
			}),
		],

		test: {
			name: "misc-nodejs",
			include: ["test/nodejs.test.ts"],
		},
	})
);
