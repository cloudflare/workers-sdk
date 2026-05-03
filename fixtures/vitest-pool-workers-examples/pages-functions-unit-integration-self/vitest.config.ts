import path from "node:path";
import {
	buildPagesASSETSBinding,
	cloudflareTest,
} from "@cloudflare/vitest-pool-workers";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

const assetsPath = path.join(__dirname, "public");

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				main: "./dist-functions/index.js", // Built by `global-setup.ts`
				miniflare: {
					compatibilityFlags: ["nodejs_compat"],
					compatibilityDate: "2024-01-01",
					kvNamespaces: ["KV_NAMESPACE"],
					serviceBindings: {
						ASSETS: await buildPagesASSETSBinding(assetsPath),
					},
				},
			}),
		],
		test: {
			// Only required for integration tests
			globalSetup: ["./global-setup.ts"],
		},
	})
);
