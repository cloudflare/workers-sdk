import { builtinModules } from "node:module";
import nodePath from "node:path";
import dedent from "ts-dedent";
import { cloudflare, defineEnv } from "unenv";
import { getBasePath } from "../../paths";
import type { Plugin, PluginBuild } from "esbuild";

const REQUIRED_NODE_BUILT_IN_NAMESPACE = "node-built-in-modules";
const REQUIRED_UNENV_ALIAS_NAMESPACE = "required-unenv-alias";

export const nodejsHybridPlugin: () => Plugin = () => {
	// Get the resolved environment.
	const { env } = defineEnv({
		nodeCompat: true,
		presets: [cloudflare],
		resolve: true,
	});
	const { alias, inject, external } = env;
	// Get the unresolved alias.
	const unresolvedAlias = defineEnv({
		nodeCompat: true,
		presets: [cloudflare],
		resolve: false,
	}).env.alias;
	return {
		name: "hybrid-nodejs_compat",
		setup(build) {
			errorOnServiceWorkerFormat(build);
			handleRequireCallsToNodeJSBuiltins(build);
			handleUnenvAliasedPackages(build, unresolvedAlias, alias, external);
			handleNodeJSGlobals(build, inject);
		},
	};
};

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
 * @param unresolvedAlias Unresolved aliases from the presets.
 * @param alias Aliases resolved to absolute paths.
 * @param external external modules.
 */
function handleUnenvAliasedPackages(
	build: PluginBuild,
	unresolvedAlias: Record<string, string>,
	alias: Record<string, string>,
	external: string[]
) {
	const UNENV_ALIAS_RE = new RegExp(`^(${Object.keys(alias).join("|")})$`);

	build.onResolve({ filter: UNENV_ALIAS_RE }, (args) => {
		const unresolved = unresolvedAlias[args.path];
		// Convert `require()` calls for NPM packages to a virtual ES Module that can be imported avoiding the require calls.
		// Note: Does not apply to Node.js packages that are handled in `handleRequireCallsToNodeJSBuiltins`
		if (
			args.kind === "require-call" &&
			(unresolved.startsWith("unenv/runtime/npm/") ||
				unresolved.startsWith("unenv/runtime/mock/"))
		) {
			return {
				path: args.path,
				namespace: REQUIRED_UNENV_ALIAS_NAMESPACE,
			};
		}

		// Resolve the alias to its absolute path and potentially mark it as external
		return {
			path: alias[args.path],
			external: external.includes(unresolved),
		};
	});

	build.initialOptions.banner = { js: "", ...build.initialOptions.banner };
	build.initialOptions.banner.js += dedent`
		function __cf_cjs(esm) {
		  const cjs = 'default' in esm ? esm.default : {};
			for (const [k, v] of Object.entries(esm)) {
				if (k !== 'default') {
					Object.defineProperty(cjs, k, {
						enumerable: true,
						value: v,
					});
				}
			}
			return cjs;
		}
		`;

	build.onLoad(
		{ filter: /.*/, namespace: REQUIRED_UNENV_ALIAS_NAMESPACE },
		({ path }) => {
			return {
				contents: dedent`
					import * as esm from '${path}';
					module.exports = __cf_cjs(esm);
				`,
				loader: "js",
			};
		}
	);
}

/**
 * Inject node globals defined in unenv's `inject` config via virtual modules
 */
function handleNodeJSGlobals(
	build: PluginBuild,
	inject: Record<string, string | string[]>
) {
	const UNENV_GLOBALS_RE = /_virtual_unenv_global_polyfill-([^.]+)\.js$/;
	const prefix = nodePath.resolve(
		getBasePath(),
		"_virtual_unenv_global_polyfill-"
	);

	build.initialOptions.inject = [
		...(build.initialOptions.inject ?? []),
		//convert unenv's inject keys to absolute specifiers of custom virtual modules that will be provided via a custom onLoad
		...Object.keys(inject).map(
			(globalName) => `${prefix}${encodeToLowerCase(globalName)}.js`
		),
	];

	build.onResolve({ filter: UNENV_GLOBALS_RE }, ({ path }) => ({ path }));

	build.onLoad({ filter: UNENV_GLOBALS_RE }, ({ path }) => {
		// eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
		const globalName = decodeFromLowerCase(path.match(UNENV_GLOBALS_RE)![1]);
		const { importStatement, exportName } = getGlobalInject(inject[globalName]);

		return {
			contents: dedent`
				${importStatement}
				globalThis.${globalName} = ${exportName};
			`,
		};
	});
}

/**
 * Get the import statement and export name to be used for the given global inject setting.
 */
function getGlobalInject(globalInject: string | string[]) {
	if (typeof globalInject === "string") {
		// the mapping is a simple string, indicating a default export, so the string is just the module specifier.
		return {
			importStatement: `import globalVar from "${globalInject}";`,
			exportName: "globalVar",
		};
	}
	// the mapping is a 2 item tuple, indicating a named export, made up of a module specifier and an export name.
	const [moduleSpecifier, exportName] = globalInject;
	return {
		importStatement: `import { ${exportName} } from "${moduleSpecifier}";`,
		exportName,
	};
}

/**
 * Encodes a case sensitive string to lowercase string.
 *
 * - Escape $ with another $ ("$" -> "$$")
 * - Escape uppercase letters with $ and turn them into lowercase letters ("L" -> "$L")
 *
 * This function exists because ESBuild requires that all resolved paths are case insensitive.
 * Without this transformation, ESBuild will clobber /foo/bar.js with /foo/Bar.js
 */
export function encodeToLowerCase(str: string): string {
	return str.replace(/[A-Z$]/g, (escape) => `$${escape.toLowerCase()}`);
}

/**
 * Decodes a string lowercased using `encodeToLowerCase` to the original strings
 */
export function decodeFromLowerCase(str: string): string {
	return str.replace(/\$[a-z$]/g, (escaped) => escaped[1].toUpperCase());
}
