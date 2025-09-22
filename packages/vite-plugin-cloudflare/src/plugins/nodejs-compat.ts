import assert from "node:assert";
import { builtinModules } from "node:module";
import * as path from "node:path";
import { getCloudflarePreset } from "@cloudflare/unenv-preset";
import { getNodeCompat } from "miniflare";
import { resolvePathSync } from "mlly";
import { defineEnv } from "unenv";
import { createPlugin } from "./utils";
import type { WorkerConfig } from "../plugin-config";
import type { ResolvedEnvironment } from "unenv";
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
						exclude: [...nodeJsBuiltins],
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

/**
 * Plugin to warn if Node.js APIs are used without enabling the `nodejs_compat` compatibility flag
 */
export const nodeJsCompatWarningsPlugin = createPlugin(
	"nodejs-compat-warnings",
	(ctx) => {
		const nodeJsCompatWarningsMap = new Map<
			WorkerConfig,
			NodeJsCompatWarnings
		>();

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
							esbuildOptions: {
								plugins: [
									{
										name: "vite-plugin-cloudflare:nodejs-compat-warnings-resolver",
										setup(build) {
											build.onResolve(
												{ filter: NODEJS_MODULES_RE },
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
													nodeJsCompatWarnings?.registerImport(path, importer);
													// Mark this path as external to avoid messy unwanted resolve errors.
													// It will fail at runtime but we will log warnings to the user.
													return { path, external: true };
												}
											);
										},
									},
								],
							},
						},
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
			async resolveId(source, importer) {
				const workerConfig = ctx.getWorkerConfig(this.environment.name);
				const nodeJsCompat = ctx.getNodeJsCompat(this.environment.name);

				if (workerConfig && !nodeJsCompat) {
					if (hasNodeJsAls(workerConfig) && isNodeAlsModule(source)) {
						// Skip if this is just async_hooks and Node.js ALS support is on.
						return;
					}

					const nodeJsCompatWarnings =
						nodeJsCompatWarningsMap.get(workerConfig);

					if (nodeJsBuiltins.has(source)) {
						nodeJsCompatWarnings?.registerImport(source, importer);

						// Mark this path as external to avoid messy unwanted resolve errors.
						// It will fail at runtime but we will log warnings to the user.
						return {
							id: source,
							external: true,
						};
					}
				}
			},
		};
	}
);

type InjectsByModule = Map<
	string,
	Array<{ injectedName: string; exportName: string; importName: string }>
>;
type VirtualModulePathToSpecifier = Map<string, string>;

export class NodeJsCompat {
	externals: Set<string>;
	entries: Set<string>;
	#env: ResolvedEnvironment;
	/**
	 * Map of module identifiers to an array of:
	 * - `injectedName`: the name injected on `globalThis`
	 * - `exportName`: the export name from the module
	 * - `importName`: the imported name
	 */
	#injectsByModule: InjectsByModule;
	/**
	 * Map of virtual module to injectable module ID,
	 * which then maps via `injectsByModule` to the global code to be injected.
	 */
	#virtualModulePathToSpecifier: VirtualModulePathToSpecifier;

	constructor(workerConfig: WorkerConfig) {
		const { env } = defineEnv({
			presets: [
				getCloudflarePreset({
					compatibilityDate: workerConfig.compatibility_date,
					compatibilityFlags: workerConfig.compatibility_flags,
				}),
			],
		});

		this.#env = env;
		this.externals = new Set(env.external);
		this.entries = this.#getEntries();
		const { injectsByModule, virtualModulePathToSpecifier } =
			this.#getInjects();
		this.#injectsByModule = injectsByModule;
		this.#virtualModulePathToSpecifier = virtualModulePathToSpecifier;
	}

	/**
	 * Gets a set of module specifiers for all possible Node.js compat polyfill entry-points
	 */
	#getEntries(): Set<string> {
		// Include all the alias targets
		const entries = new Set(Object.values(this.#env.alias));

		// Include all the injection targets
		for (const globalInject of Object.values(this.#env.inject)) {
			if (typeof globalInject === "string") {
				entries.add(globalInject);
			} else {
				assert(
					globalInject[0] !== undefined,
					"Expected first element of globalInject to be defined"
				);
				entries.add(globalInject[0]);
			}
		}

		// Include all the polyfills
		this.#env.polyfill.forEach((polyfill) => entries.add(polyfill));

		// Exclude all the externals
		this.externals.forEach((external) => entries.delete(external));

		return entries;
	}

	#getInjects(): {
		injectsByModule: InjectsByModule;
		virtualModulePathToSpecifier: VirtualModulePathToSpecifier;
	} {
		const injectsByModule = new Map<
			string,
			{ injectedName: string; exportName: string; importName: string }[]
		>();
		const virtualModulePathToSpecifier = new Map<string, string>();
		const virtualModulePrefix = `\0_nodejs_global_inject-`;

		for (const [injectedName, moduleSpecifier] of Object.entries(
			this.#env.inject
		)) {
			const [module, exportName, importName] = Array.isArray(moduleSpecifier)
				? [moduleSpecifier[0], moduleSpecifier[1], moduleSpecifier[1]]
				: [moduleSpecifier, "default", "defaultExport"];

			if (!injectsByModule.has(module)) {
				injectsByModule.set(module, []);
				virtualModulePathToSpecifier.set(
					`${virtualModulePrefix}${module.replaceAll("/", "-")}`,
					module
				);
			}

			const injects = injectsByModule.get(module);
			assert(injects, `expected injects for "${module}" to be defined`);
			injects.push({ injectedName, exportName, importName });
		}

		return { injectsByModule, virtualModulePathToSpecifier };
	}

	/**
	 * Does the given module ID resolve to a virtual module corresponding to a global injection module?
	 */
	isGlobalVirtualModule(source: string): boolean {
		return this.#virtualModulePathToSpecifier.has(source);
	}

	/**
	 * Get the contents of the virtual module corresponding to a global injection module.
	 */
	getGlobalVirtualModule(source: string): string | undefined {
		const module = this.#virtualModulePathToSpecifier.get(source);

		if (!module) {
			return;
		}

		const injects = this.#injectsByModule.get(module);
		assert(injects, `expected injects for "${module}" to be defined`);
		const imports = injects.map(({ exportName, importName }) =>
			importName === exportName ? exportName : `${exportName} as ${importName}`
		);

		return [
			`import { ${imports.join(", ")} } from "${module}";`,
			...injects.map(
				({ injectedName, importName }) =>
					`globalThis.${injectedName} = ${importName};`
			),
		].join("\n");
	}

	/**
	 * Gets the necessary global polyfills to inject into the entry-point of the user's code.
	 */
	injectGlobalCode(): string {
		const injectedCode = Array.from(this.#virtualModulePathToSpecifier.keys())
			.map((moduleId) => `import "${moduleId}";`)
			.join("\n");
		// Some globals are not injected using the approach above but are added to globalThis via side-effect imports of polyfills from the unenv-preset.
		const polyfillCode = this.#env.polyfill
			.map((polyfillPath) => `import "${polyfillPath}";`)
			.join("\n");

		return `${injectedCode}${polyfillCode}`;
	}

	/**
	 * Resolves the `source` to a Node.js compat alias if possible.
	 *
	 * If there is an alias, the return value is an object with:
	 * - `unresolved`: a bare import path to the polyfill (e.g. `unenv/runtime/node/crypto`)
	 * - `resolved`: an absolute path to the polyfill (e.g. `/path/to/project/node_modules/unenv/runtime/node/child_process/index.mjs`)
	 */
	resolveNodeJsImport(
		source: string
	): { unresolved: string; resolved: string } | undefined {
		const alias = this.#env.alias[source];

		// These aliases must be resolved from the context of this plugin since the alias will refer to one of the
		// `@cloudflare/unenv-preset` or the `unenv` packages, which are direct dependencies of this package,
		// and not the user's project.
		// We exclude `externals` as these should be externalized rather than optimized.
		if (alias && !this.externals.has(alias)) {
			return {
				unresolved: alias,
				resolved: resolvePathSync(alias, { url: import.meta.url }),
			};
		}

		if (this.entries.has(source)) {
			return {
				unresolved: source,
				resolved: resolvePathSync(source, { url: import.meta.url }),
			};
		}
	}
}

/**
 * Returns `true` if the given combination of compat dates and flags enables Node.js compatibility.
 */
export function hasNodeJsCompat(workerConfig: WorkerConfig) {
	const nodeCompatMode = getNodeCompat(
		workerConfig.compatibility_date,
		workerConfig.compatibility_flags ?? []
	).mode;

	if (nodeCompatMode === "v2") {
		return true;
	}

	if (nodeCompatMode === "v1") {
		throw new Error(
			`Unsupported Node.js compat mode (v1). Only the v2 mode is supported, either change your compat date to "2024-09-23" or later, or set the "nodejs_compat_v2" compatibility flag`
		);
	}

	return false;
}

/**
 * Returns true if Node.js async local storage (ALS) is enabled (and not full Node.js compatibility mode).
 */
function hasNodeJsAls(workerConfig: WorkerConfig | undefined) {
	return (
		workerConfig !== undefined &&
		getNodeCompat(
			workerConfig.compatibility_date,
			workerConfig.compatibility_flags ?? []
		).mode === "als"
	);
}

/**
 * All the Node.js modules including their `node:...` aliases.
 */
const nodeJsBuiltins = new Set([
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
]);

const NODEJS_MODULES_RE = new RegExp(`^(node:)?(${builtinModules.join("|")})$`);

function isNodeAlsModule(path: string) {
	return /^(node:)?async_hooks$/.test(path);
}

function assertHasNodeJsCompat(
	nodeJsCompat: NodeJsCompat | undefined
): asserts nodeJsCompat is NodeJsCompat {
	assert(nodeJsCompat, `expected nodeJsCompat to be defined`);
}

class NodeJsCompatWarnings {
	private sources = new Map<string, Set<string>>();
	private timer: NodeJS.Timeout | undefined;

	constructor(
		private readonly environmentName: string,
		private readonly resolvedViteConfig: vite.ResolvedConfig
	) {}

	registerImport(source: string, importer = "<unknown>") {
		const importers = this.sources.get(source) ?? new Set();
		this.sources.set(source, importers);
		importers.add(importer);
		this.renderWarningsOnIdle();
	}

	private renderWarningsOnIdle() {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => {
			this.renderWarnings();
			this.timer = undefined;
		}, 500);
	}

	private renderWarnings() {
		if (this.sources.size > 0) {
			let message =
				`Unexpected Node.js imports for environment "${this.environmentName}". ` +
				`Do you need to enable the "nodejs_compat" compatibility flag? ` +
				"Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/ for more details.\n";
			this.sources.forEach((importers, source) => {
				importers.forEach((importer) => {
					message += ` - "${source}" imported from "${path.relative(this.resolvedViteConfig.root, importer)}"\n`;
				});
			});
			this.resolvedViteConfig.logger.warn(message, {
				timestamp: true,
			});
			this.sources.clear();
		}
	}
}
