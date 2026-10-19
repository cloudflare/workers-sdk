import { defineConfig, mergeConfig } from "vitest/config";
import e2eConfig from "./vitest.config.e2e";

/**
 * Runs the playground suite against `@cloudflare/rsbuild-plugin`. The harness
 * translates each playground's Vite config (see `__test-utils__/rsbuild.ts`).
 */
export default mergeConfig(
	e2eConfig,
	defineConfig({
		test: {
			env: { CLOUDFLARE_TEST_BUNDLER: "rsbuild" },
			// Individual tests of Vite-specific behaviour in otherwise portable specs.
			testNamePattern: new RegExp(
				`^(?!.*(${[
					// Asserts Vite's HMR log.
					"updates using HMR code in Worker entry file",
					// Vite detects changes to the Worker's exports with the module runner.
					"restarts dev server with updated exports when exports have changed",
					// Vite doesn't serve HTML from `publicDir` paths inside the root,
					// which the harness serves as a second public directory.
					"does not return HTML files in the public directory if the public directory is included in the path",
					// SWC lowers `using` declarations at every target.
					"keeps using declarations in the Worker build",
				].join("|")}))`
			),
			exclude: [
				"**/node_modules/**",
				// Vite-specific features: child environments, the hot channel,
				// virtual modules, custom `buildApp`s, middleware mode, `bundledDev`,
				// the module runner's error overlay and prerendering (which needs
				// `buildApp`).
				"child-environment/**",
				"hot-channel/**",
				"virtual-modules/**",
				"main-resolution/__tests__/virtual-module-main/**",
				"custom-build-app/**",
				"multi-worker/__tests__/custom-build-app/**",
				"middleware-mode/**",
				"spa-with-api/__tests__/client-bundled-dev/**",
				"spa-with-api/__tests__/child-compiler/**",
				"errors/**",
				"prerendering/**",
				// Vite plugins and options without Rsbuild equivalents in the harness.
				"module-resolution/**",
				// Relies on Rollup's `preserveModules` to emit the module that the
				// Worker imports with a runtime path.
				"dynamic-import-paths/**",
				"node-compat/__tests__/worker-resolve-externals/**",
				"partyserver/**",
				"multi-worker/__tests__/custom-output-directories/**",
				"spa-with-api/__tests__/custom-output-directories/**",
				// Asserts Vite's `server.fs.deny` 403s. Rsbuild doesn't serve files
				// from the project root, so these requests reach the Worker instead.
				"sensitive-files/**",
				// Evaluates `crypto.randomUUID()` at global scope, which workerd only
				// allows because the Vite module runner evaluates modules lazily.
				"config-changes/**",
				// Containers aren't supported yet.
				"containers/**",
			],
			server: {
				deps: {
					// Loading `cloudflare.config.ts` relies on Node.js module hooks,
					// which Vitest's module runner bypasses.
					external: [
						/packages[/\\](config|rsbuild-plugin-cloudflare)[/\\]dist/,
					],
				},
			},
		},
	})
);
