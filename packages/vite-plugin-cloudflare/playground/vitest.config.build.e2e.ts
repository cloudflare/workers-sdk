import { defineConfig } from "vitest/config";
import vitestServeConfig from "./vitest.config.serve.e2e";

export default defineConfig({
	...vitestServeConfig,
	test: {
		...vitestServeConfig.test,
		// We run these tests in a single fork to avoid them running in parallel.
		// Otherwise we occasionally get flakes where two tests are overwriting
		// the same .wrangler/deploy/config.json output files
		poolOptions: { forks: { singleFork: true } },
	},
});
