import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineProject, mergeConfig } from "vitest/config";
import configShared from "../../../vitest.shared";

export default mergeConfig(
	configShared,
	defineProject({
		plugins: [
			cloudflareTest({
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
				miniflare: {
					// Add a test-only binding, so tests can introspect the Workflow
					workflows: {
						GREETING_WORKFLOW: {
							name: "greeting-workflow",
							className: "GreetingWorkflow",
						},
					},
				},
			}),
		],
		test: {
			name: "@scoped/workflows-exports",
		},
	})
);
