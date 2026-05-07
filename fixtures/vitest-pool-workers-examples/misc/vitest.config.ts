import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { Response } from "miniflare";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				miniflare: {
					kvNamespaces: ["KV_NAMESPACE"],
					outboundService(request) {
						return new Response(`fallthrough:${request.method} ${request.url}`);
					},
					serviceBindings: {
						ASSETS(request) {
							return new Response(`assets:${request.method} ${request.url}`);
						},
					},
					workers: [
						{
							name: "other",
							modules: true,
							scriptPath: "./src/other-worker.mjs",
						},
					],
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			}),
		],

		define: {
			CONFIG_DEFINED_THING: '"thing"',
			"CONFIG_NESTED.DEFINED.THING": "[1,2,3]",
		},

		test: {
			exclude: ["test/assets.test.ts", "test/nodejs.test.ts"],
			globalSetup: ["./global-setup.ts"],
			setupFiles: ["test/setup.ts"],
		},
	})
);
