import { defineConfig, mergeConfig } from "vitest/config";
import e2eConfig from "./vitest.config";

/**
 * Runs the e2e suite against `@cloudflare/rsbuild-plugin`. `seed()` converts
 * each fixture to an Rsbuild project (see `rsbuild.ts`).
 */
export default mergeConfig(
	e2eConfig,
	defineConfig({
		test: {
			env: {
				CLOUDFLARE_TEST_BUNDLER: "rsbuild",
				// Vitest sets \`NODE_ENV=test\`, which the commands inherit. The Rsbuild
				// CLI would then load \`.env.test\` and \`.env\` files into
				// \`process.env\`, where they take precedence over the plugin's
				// \`.env.[mode]\` files. An empty value lets Rsbuild set it as usual.
				NODE_ENV: "",
			},
			globalSetup: ["rsbuild.ts"],
			exclude: [
				"**/node_modules/**",
				// Asserts Vite's dependency optimizer.
				"dynamic.test.ts",
				// Asserts the Vite plugin's validation of Vite environment options.
				"invalid-worker-environment-options.test.ts",
				// Asserts the warning for Vite's "ssr" environment.
				"nodejs-compat-warnings.test.ts",
				// Containers aren't supported yet.
				"containers-image-free.test.ts",
			],
		},
	})
);
