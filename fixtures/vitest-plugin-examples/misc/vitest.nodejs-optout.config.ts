import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				wrangler: {
					configPath: "./wrangler.nodejs-optout.jsonc",
				},
			}),
		],

		test: {
			name: "misc-nodejs-optout",
			include: ["test/nodejs-optout.test.ts"],
		},
	})
);
