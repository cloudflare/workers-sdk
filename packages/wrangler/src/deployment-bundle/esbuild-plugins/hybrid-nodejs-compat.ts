import assert from "node:assert";
import { builtinModules } from "node:module";
import nodePath from "node:path";
import dedent from "ts-dedent";
import { getBasePath } from "../../paths";
import type { Plugin, PluginBuild } from "esbuild";

const REQUIRED_NODE_BUILT_IN_NAMESPACE = "node-built-in-modules";
const REQUIRED_UNENV_ALIAS_NAMESPACE = "required-unenv-alias";

/**
 * ESBuild plugin to apply the unenv preset.
 *
 * @returns ESBuild plugin
 */
export function nodejsHybridPlugin({
	compatibilityDate,
	compatibilityFlags,
}: {
	compatibilityDate?: string;
	compatibilityFlags?: string[];
}): Plugin {
	return {
		name: "hybrid-nodejs_compat",
		async setup(build) {
			// `unenv` and `@cloudflare/unenv-preset` only publish esm
			const { defineEnv } = await import("unenv");
			const { getCloudflarePreset } = await import("@cloudflare/unenv-preset");
			const { alias, inject, external, polyfill } = defineEnv({
				presets: [
					getCloudflarePreset({
						compatibilityDate,
						compatibilityFlags,
					}),
					{
						alias: {
							// Force esbuild to use the node implementation of debug instead of unenv's no-op stub.
							// The alias is processed by handleUnenvAliasedPackages which uses require.resolve().
							debug: "debug",
						},
					},
				],
				npmShims: true,
			}).env;

			errorOnServiceWorkerFormat(build);
			handleRequireCallsToNodeJSBuiltins(build);
			handleUnenvAliasedPackages(build, alias, external);
			handleNodeJSGlobals(build, inject, polyfill);
		},
	};
}

const NODEJS_MODULES_RE = new RegExp(`^(node:)?(${builtinModules.join("|")})$`);

/**
 * If we are bundling a "Service Worker" formatted Worker, imports of external modules,
 * which won't be inlined/bundled by esbuild, are invalid.
 *
 * This `onResolve()` handler will error if it identifies node.js external imports.
 */
function errorOnServiceWorkerFormat(build: PluginBuild) {
	const paths = new Set();
	build.onStart(() => paths.clear());
	build.onResolve({ filter: NODEJS_MODULES_RE }, (args) => {
		paths.add(args.path);
		return null;
	});
	build.onEnd(() => {
		if (build.initialOptions.format === "iife" && paths.size > 0) {
			const pathList = new Intl.ListFormat("en-US").format(
				Array.from(paths.keys())
					.map((p) => `"${p}"`)
					.sort()
			);
			return {
				errors: [
					{
						text: dedent`
							Unexpected external import of ${pathList}.
							Your worker has no default export, which means it is assumed to be a Service Worker format Worker.
							Did you mean to create a ES Module format Worker?
							If so, try adding \`export default { ... }\` in your entry-point.
							See https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/.
						`,
					},
				],
			};
		}
	});
}

/**
 * We must convert `require()` calls for Node.js modules to a virtual ES Module that can be imported avoiding the require calls.
 * We do this by creating a special virtual ES module that re-exports the library in an onLoad handler.
 * The onLoad handler is triggered by matching the "namespace" added to the resolve.
 */
function handleRequireCallsToNodeJSBuiltins(build: PluginBuild) {
	build.onResolve({ filter: NODEJS_MODULES_RE }, (args) => {
		if (args.kind === "require-call") {
			return {
				path: args.path,
				namespace: REQUIRED_NODE_BUILT_IN_NAMESPACE,
			};
		}
	});
	build.onLoad(
		{ filter: /.*/, namespace: REQUIRED_NODE_BUILT_IN_NAMESPACE },
		({ path }) => {
			return {
				contents: dedent`
					import libDefault from '${path}';
					module.exports = libDefault;`,
				loader: "js",
			};
		}
	);
}

/**
 * Handles aliased NPM packages.
 *
 * @param build ESBuild PluginBuild.
 * @param alias Aliases resolved to absolute paths.
 * @param external external modules.
 */
function handleUnenvAliasedPackages(
	build: PluginBuild,
	alias: Record<string, string>,
	external: readonly string[]
) {
	// esbuild expects alias paths to be absolute
	const aliasAbsolute: Record<string, string> = {};
	for (const [module, unresolvedAlias] of Object.entries(alias)) {
		try {
			aliasAbsolute[module] = require.resolve(unresolvedAlias);
		} catch {
			// this is an alias for package that is not installed in the current app => ignore
		}
	}

	const UNENV_ALIAS_RE = new RegExp(
		`^(${Object.keys(aliasAbsolute).join("|")})$`
	);

	build.onResolve({ filter: UNENV_ALIAS_RE }, (args) => {
		const unresolvedAlias = alias[args.path];
		// Convert `require()` calls for NPM packages to a virtual ES Module that can be imported avoiding the require calls.
		// Note: Does not apply to Node.js packages that are handled in `handleRequireCallsToNodeJSBuiltins`
		if (
			args.kind === "require-call" &&
			(unresolvedAlias.startsWith("unenv/npm/") ||
				unresolvedAlias.startsWith("unenv/mock/"))
		) {
			return {
				path: args.path,
				namespace: REQUIRED_UNENV_ALIAS_NAMESPACE,
			};
		}

		// Resolve the alias to its absolute path and potentially mark it as external
		return {
			path: aliasAbsolute[args.path],
			external: external.includes(unresolvedAlias),
		};
	});

	build.onLoad(
		{ filter: /.*/, namespace: REQUIRED_UNENV_ALIAS_NAMESPACE },
		({ path }) => {
			return {
				contents: dedent`
					import * as esm from '${path}';
					module.exports = Object.entries(esm)
								.filter(([k,]) => k !== 'default')
								.reduce((cjs, [k, value]) =>
									Object.defineProperty(cjs, k, { value, enumerable: true }),
									"default" in esm ? esm.default : {}
								);
				`,
				loader: "js",
			};
		}
	);
}

/**
 * Inject node globals defined in unenv's preset `inject` and `polyfill` properties.
 *
 * - an `inject` injects virtual module defining the name on `globalThis`
 * - a `polyfill` is injected directly
 */
function handleNodeJSGlobals(
	build: PluginBuild,
	inject: Record<string, string | readonly string[]>,
	polyfill: readonly string[]
) {
	const UNENV_VIRTUAL_MODULE_RE = /_virtual_unenv_global_polyfill-(.+)$/;
	const prefix = nodePath.resolve(
		getBasePath(),
		"_virtual_unenv_global_polyfill-"
	);

	/**
	 * Map of module identifiers to
	 * - `injectedName`: the name injected on `globalThis`
	 * - `exportName`: the export name from the module
	 * - `importName`: the imported name
	 */
	const injectsByModule = new Map<
		string,
		{ injectedName: string; exportName: string; importName: string }[]
	>();

	// Module specifier (i.e. `/unenv/runtime/node/...`) keyed by path (i.e. `/prefix/_virtual_unenv_global_polyfill-...`)
	const virtualModulePathToSpecifier = new Map<string, string>();

	for (const [injectedName, moduleSpecifier] of Object.entries(inject)) {
		const [module, exportName, importName] = Array.isArray(moduleSpecifier)
			? [moduleSpecifier[0], moduleSpecifier[1], moduleSpecifier[1]]
			: [moduleSpecifier, "default", "defaultExport"];

		if (!injectsByModule.has(module)) {
			injectsByModule.set(module, []);
			virtualModulePathToSpecifier.set(
				prefix + module.replaceAll("/", "-"),
				module
			);
		}
		// eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
		injectsByModule.get(module)!.push({ injectedName, exportName, importName });
	}

	build.initialOptions.inject = [
		...(build.initialOptions.inject ?? []),
		// Inject the virtual modules
		...virtualModulePathToSpecifier.keys(),
		// Inject the polyfills - needs an absolute path
		...polyfill.map((m) => require.resolve(m)),
	];

	build.onResolve({ filter: UNENV_VIRTUAL_MODULE_RE }, ({ path }) => ({
		path,
	}));

	build.onLoad({ filter: UNENV_VIRTUAL_MODULE_RE }, ({ path }) => {
		const module = virtualModulePathToSpecifier.get(path);
		assert(module, `Expected ${path} to be mapped to a module specifier`);
		const injects = injectsByModule.get(module);
		assert(injects, `Expected ${module} to inject values`);

		const imports = injects.map(({ exportName, importName }) =>
			importName === exportName ? exportName : `${exportName} as ${importName}`
		);

		return {
			contents: dedent`
				import { ${imports.join(", ")} } from "${module}";
				${injects.map(({ injectedName, importName }) => `globalThis.${injectedName} = ${importName};`).join("\n")}
			`,
		};
	});
}
