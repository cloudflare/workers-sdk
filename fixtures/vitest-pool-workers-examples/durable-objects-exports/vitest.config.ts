// Opt in to declarative Durable Object `exports`. This must be set before the
// `cloudflareTest` plugin runs (and before vitest forks the pool worker), so
// the wrangler config read inside `@cloudflare/vitest-pool-workers` sees it.
process.env.X_DO_EXPORTS = "true";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
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
			}),
		],
		test: {
			name: "@scoped/durable-objects-exports",
		},
	})
);
