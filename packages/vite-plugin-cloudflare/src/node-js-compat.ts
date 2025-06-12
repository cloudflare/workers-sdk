import assert from "node:assert";
import { builtinModules } from "node:module";
import path from "node:path";
import { cloudflare } from "@cloudflare/unenv-preset";
import MagicString from "magic-string";
import { getNodeCompat } from "miniflare";
import { resolvePathSync } from "mlly";
import { defineEnv } from "unenv";
import * as vite from "vite";
import type { WorkerConfig } from "./plugin-config";

const { env } = defineEnv({
	nodeCompat: true,
	presets: [cloudflare],
});

export const nodeCompatExternals = new Set(env.external);
export const nodeCompatEntries = getNodeCompatEntries();

/**
 * All the Node.js modules including their `node:...` aliases.
 */
export const nodejsBuiltins = new Set([
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
]);
export const NODEJS_MODULES_RE = new RegExp(
	`^(node:)?(${builtinModules.join("|")})$`
);

/**
 * Returns true if the given combination of compat dates and flags means that we need Node.js compatibility.
 */
export function isNodeCompat(workerConfig: WorkerConfig | undefined) {
	if (workerConfig === undefined) {
		return false;
	}
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
export function isNodeAls(workerConfig: WorkerConfig | undefined) {
	return (
		workerConfig !== undefined &&
		getNodeCompat(
			workerConfig.compatibility_date,
			workerConfig.compatibility_flags ?? []
		).mode === "als"
	);
}

export function isNodeAlsModule(path: string) {
	return /^(node:)?async_hooks$/.test(path);
}

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
/**
 * Map of virtual module (prefixed by `virtualModulePrefix`) to injectable module id,
 * which then maps via `injectsByModule` to the global code to be injected.
 */
const virtualModulePathToSpecifier = new Map<string, string>();
const virtualModulePrefix = `\0_nodejs_global_inject-`;

for (const [injectedName, moduleSpecifier] of Object.entries(env.inject)) {
	const [module, exportName, importName] = Array.isArray(moduleSpecifier)
		? [moduleSpecifier[0], moduleSpecifier[1], moduleSpecifier[1]]
		: [moduleSpecifier, "default", "defaultExport"];

	if (!injectsByModule.has(module)) {
		injectsByModule.set(module, []);
		virtualModulePathToSpecifier.set(
			virtualModulePrefix + module.replaceAll("/", "-"),
			module
		);
	}
	const injects = injectsByModule.get(module);
	assert(injects, `expected injects for ${module} to be defined`);
	injects.push({ injectedName, exportName, importName });
}

/**
 * Does the given module id resolve to a virtual module corresponding to a global injection module?
 */
export function isGlobalVirtualModule(modulePath: string) {
	return virtualModulePathToSpecifier.has(modulePath);
}

/**
 * Get the contents of the virtual module corresponding to a global injection module.
 */
export function getGlobalVirtualModule(modulePath: string) {
	const module = virtualModulePathToSpecifier.get(modulePath);
	if (!module) {
		return undefined;
	}
	const injects = injectsByModule.get(module);
	assert(injects, `expected injects for ${module} to be defined`);

	const imports = injects.map(({ exportName, importName }) =>
		importName === exportName ? exportName : `${exportName} as ${importName}`
	);

	return (
		`import { ${imports.join(", ")} } from "${module}";\n` +
		`${injects.map(({ injectedName, importName }) => `globalThis.${injectedName} = ${importName};`).join("\n")}`
	);
}

/**
 * Gets the necessary global polyfills to inject into the entry-point of the user's code.
 */
export function injectGlobalCode(id: string, code: string) {
	const injectedCode = Array.from(virtualModulePathToSpecifier.keys())
		.map((moduleId) => `import "${moduleId}";\n`)
		.join("");

	// Some globals are not injected using the approach above but are added to globalThis via side-effect imports of polyfills from the unenv-preset.
	const polyfillCode = env.polyfill
		.map((polyfillPath) => `import "${polyfillPath}";\n`)
		.join("");

	const modified = new MagicString(code);
	modified.prepend(injectedCode);
	modified.prepend(polyfillCode);
	return {
		code: modified.toString(),
		map: modified.generateMap({ hires: "boundary", source: id }),
	};
}

/**
 * Resolves the `source` to a Node.js compat alias if possible.
 *
 * If there is an alias, the return value is an object with:
 * - `unresolved`: a bare import path to the polyfill (e.g. `unenv/runtime/node/crypto`)
 * - `resolved`: an absolute path to the polyfill (e.g. `/path/to/project/node_modules/unenv/runtime/node/child_process/index.mjs`)
 */
export function resolveNodeJSImport(source: string) {
	const alias = env.alias[source];

	// These aliases must be resolved from the context of this plugin since the alias will refer to one of the
	// `@cloudflare/unenv-preset` or the `unenv` packages, which are direct dependencies of this package,
	// and not the user's project.
	// We exclude `nodeCompatExternals` as these should be externalized rather than optimized
	if (alias && !nodeCompatExternals.has(alias)) {
		return {
			unresolved: alias,
			resolved: resolvePathSync(alias, { url: import.meta.url }),
		};
	}
	if (nodeCompatEntries.has(source)) {
		return {
			unresolved: source,
			resolved: resolvePathSync(source, { url: import.meta.url }),
		};
	}
}

/**
 * Gets a set of module specifiers for all possible Node.js compat polyfill entry-points
 */
function getNodeCompatEntries() {
	// Include all the alias targets
	const entries = new Set<string>(Object.values(env.alias));

	// Include all the injection targets
	for (const globalInject of Object.values(env.inject)) {
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
	env.polyfill.forEach((polyfill) => entries.add(polyfill));

	// Exclude all the externals
	nodeCompatExternals.forEach((external) => entries.delete(external));

	return entries;
}

export class NodeJsCompatWarnings {
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
