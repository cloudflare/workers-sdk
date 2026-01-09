import assert from "node:assert";
import { nonPrefixedNodeModules } from "@cloudflare/unenv-preset";
import {
	assertHasNodeJsCompat,
	hasNodeJsAls,
	isNodeAlsModule,
	NodeJsCompatWarnings,
} from "../nodejs-compat";
import { createPlugin, isRolldown } from "../utils";
import type { ResolvedWorkerConfig } from "../plugin-config";
import type * as vite from "vite";

/**
 * Plugin to support the `nodejs_als` compatibility flag
 */
export const nodeJsAlsPlugin = createPlugin("nodejs-als", (ctx) => {
	return {
		configEnvironment(name) {
			if (hasNodeJsAls(ctx.getWorkerConfig(name))) {
				return {
					resolve: {
						builtins: ["async_hooks", "node:async_hooks"],
					},
					optimizeDeps: {
						exclude: ["async_hooks", "node:async_hooks"],
					},
				};
			}
		},
	};
});

/**
 * Plugin to support the `nodejs_compat` compatibility flag
 */
export const nodeJsCompatPlugin = createPlugin("nodejs-compat", (ctx) => {
	return {
		configEnvironment(name) {
			const nodeJsCompat = ctx.getNodeJsCompat(name);

			// Only configure this environment if it is a Worker using Node.js compatibility.
			if (nodeJsCompat) {
				return {
					resolve: {
						builtins: [...nodeJsCompat.externals],
					},
					optimizeDeps: {
						// This is a list of module specifiers that the dependency optimizer should not follow when doing import analysis.
						// In this case we provide a list of all the Node.js modules, both those built-in to workerd and those that will be polyfilled.
						// Obviously we don't want/need the optimizer to try to process modules that are built-in;
						// But also we want to avoid following the ones that are polyfilled since the dependency-optimizer import analyzer does not
						// resolve these imports using our `resolveId()` hook causing the optimization step to fail.
						exclude: [
							// The `node:` prefix is optional for older built-in modules.
							...nonPrefixedNodeModules,
							...nonPrefixedNodeModules.map((module) => `node:${module}`),
							// New Node.js built-in modules are only published with the `node:` prefix.
							...[
								"node:sea",
								"node:sqlite",
								"node:test",
								"node:test/reporters",
							],
						],
					},
				};
			}
		},
		applyToEnvironment(environment) {
			// Only run this plugin's hooks if it is a Worker with Node.js compatibility.
			return ctx.getNodeJsCompat(environment.name) !== undefined;
		},
		// We need the resolver from this plugin to run before built-in ones, otherwise Vite's built-in
		// resolver will try to externalize the Node.js module imports (e.g. `perf_hooks` and `node:tty`)
		// rather than allowing the resolve hook here to alias them to polyfills.
		enforce: "pre",
		async resolveId(source, importer, options) {
			const nodeJsCompat = ctx.getNodeJsCompat(this.environment.name);
			assertHasNodeJsCompat(nodeJsCompat);

			if (nodeJsCompat.isGlobalVirtualModule(source)) {
				return source;
			}

			// See if we can map the `source` to a Node.js compat alias.
			const result = nodeJsCompat.resolveNodeJsImport(source);

			if (!result) {
				// The source is not a Node.js compat alias so just pass it through
				return this.resolve(source, importer, options);
			}

			if (this.environment.mode === "dev") {
				assert(
					this.environment.depsOptimizer,
					"depsOptimizer is required in dev mode"
				);
				// We are in dev mode (rather than build).
				// So let's pre-bundle this polyfill entry-point using the dependency optimizer.
				const { id } = this.environment.depsOptimizer.registerMissingImport(
					result.unresolved,
					result.resolved
				);
				// We use the unresolved path to the polyfill and let the dependency optimizer's
				// resolver find the resolved path to the bundled version.
				return this.resolve(id, importer, options);
			}

			// We are in build mode so return the absolute path to the polyfill.
			return this.resolve(result.resolved, importer, options);
		},
		load(id) {
			const nodeJsCompat = ctx.getNodeJsCompat(this.environment.name);
			assertHasNodeJsCompat(nodeJsCompat);

			return nodeJsCompat.getGlobalVirtualModule(id);
		},
		async configureServer(viteDevServer) {
			// Pre-optimize Node.js compat library entry-points for those environments that need it.
			await Promise.all(
				Object.values(viteDevServer.environments).flatMap(
					async (environment) => {
						const nodeJsCompat = ctx.getNodeJsCompat(environment.name);

						if (nodeJsCompat) {
							// Make sure that the dependency optimizer has been initialized.
							// This ensures that its standard static crawling to identify libraries to optimize still happens.
							// If you don't call `init()` then the calls to `registerMissingImport()` appear to cancel the static crawling.
							await environment.depsOptimizer?.init();

							// Register every unenv-preset entry-point with the dependency optimizer upfront before the first request.
							// Without this the dependency optimizer will try to bundle them on-the-fly in the middle of the first request.
							// That can potentially cause problems if it causes previously optimized bundles to become stale and need to be bundled.
							return Array.from(nodeJsCompat.entries).map((entry) => {
								const result = nodeJsCompat.resolveNodeJsImport(entry);

								if (result) {
									const registration =
										environment.depsOptimizer?.registerMissingImport(
											result.unresolved,
											result.resolved
										);

									return registration?.processing;
								}
							});
						}
					}
				)
			);
		},
	};
});

let exitCallback = () => {};

process.on("exit", () => {
	exitCallback();
});

/**
 * Plugin to warn if Node.js APIs are used without enabling the `nodejs_compat` compatibility flag
 */
export const nodeJsCompatWarningsPlugin = createPlugin(
	"nodejs-compat-warnings",
	(ctx) => {
		const nodeJsCompatWarningsMap = new Map<
			ResolvedWorkerConfig,
			NodeJsCompatWarnings
		>();

		exitCallback = () => {
			for (const nodeJsCompatWarnings of nodeJsCompatWarningsMap.values()) {
				nodeJsCompatWarnings.renderWarnings();
			}
		};

		function resolveId(
			environmentName: string,
			source: string,
			importer?: string
		) {
			const workerConfig = ctx.getWorkerConfig(environmentName);
			const nodeJsCompat = ctx.getNodeJsCompat(environmentName);

			if (workerConfig && !nodeJsCompat) {
				if (hasNodeJsAls(workerConfig) && isNodeAlsModule(source)) {
					// Skip if this is just async_hooks and Node.js ALS support is on.
					return;
				}

				const nodeJsCompatWarnings = nodeJsCompatWarningsMap.get(workerConfig);

				if (
					source.startsWith("node:") ||
					nonPrefixedNodeModules.includes(source)
				) {
					nodeJsCompatWarnings?.registerImport(source, importer);

					// Mark this path as external to avoid messy unwanted resolve errors.
					// It will fail at runtime but we will log warnings to the user.
					return {
						id: source,
						external: true,
					};
				}
			}
		}

		return {
			// We must ensure that the `resolveId` hook runs before the built-in ones.
			// Otherwise we never see the Node.js built-in imports since they get handled by default Vite behavior.
			enforce: "pre",
			configEnvironment(environmentName) {
				const workerConfig = ctx.getWorkerConfig(environmentName);
				const nodeJsCompat = ctx.getNodeJsCompat(environmentName);

				if (workerConfig && !nodeJsCompat) {
					return {
						optimizeDeps: {
							...(isRolldown
								? {
										rolldownOptions: {
											plugins: [
												{
													name: "vite-plugin-cloudflare:nodejs-compat-warnings-resolver",
													resolveId(source: string, importer?: string) {
														return resolveId(environmentName, source, importer);
													},
												},
											],
										},
									}
								: {
										esbuildOptions: {
											plugins: [
												{
													name: "vite-plugin-cloudflare:nodejs-compat-warnings-resolver",
													setup(build) {
														build.onResolve(
															{
																filter: new RegExp(
																	`^(${nonPrefixedNodeModules.join("|")}|node:.+)$`
																),
															},
															({ path, importer }) => {
																if (
																	hasNodeJsAls(workerConfig) &&
																	isNodeAlsModule(path)
																) {
																	// Skip if this is just async_hooks and Node.js ALS support is on.
																	return;
																}

																const nodeJsCompatWarnings =
																	nodeJsCompatWarningsMap.get(workerConfig);
																nodeJsCompatWarnings?.registerImport(
																	path,
																	importer
																);
																// Mark this path as external to avoid messy unwanted resolve errors.
																// It will fail at runtime but we will log warnings to the user.
																return { path, external: true };
															}
														);
													},
												},
											],
										},
									}),
						} as vite.DepOptimizationOptions, // `rolldownOptions` added in Vite 8
					};
				}
			},
			configResolved(resolvedViteConfig) {
				for (const environmentName of Object.keys(
					resolvedViteConfig.environments
				)) {
					const workerConfig = ctx.getWorkerConfig(environmentName);
					const nodeJsCompat = ctx.getNodeJsCompat(environmentName);

					if (workerConfig && !nodeJsCompat) {
						nodeJsCompatWarningsMap.set(
							workerConfig,
							new NodeJsCompatWarnings(environmentName, resolvedViteConfig)
						);
					}
				}
			},
			applyToEnvironment(environment) {
				return (
					ctx.getWorkerConfig(environment.name) !== undefined &&
					!ctx.getNodeJsCompat(environment.name)
				);
			},
			async resolveId(source, importer) {
				return resolveId(this.environment.name, source, importer);
			},
		};
	}
);
