import assert from "node:assert";
import { getCloudflarePreset } from "@cloudflare/unenv-preset";
import { getNodeCompat } from "miniflare";
import { resolvePathSync } from "mlly";
import { defineEnv } from "unenv";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { ResolvedEnvironment } from "unenv";

/** Prefix of the virtual modules that inject Node.js globals into a Worker. */
export const VIRTUAL_NODEJS_GLOBAL_INJECT_PREFIX =
	"virtual:cloudflare/nodejs-global-inject/";

type CompatConfig = Pick<
	ParsedInputWorkerConfig,
	"compatibilityDate" | "compatibilityFlags"
>;
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

	constructor(workerConfig: CompatConfig) {
		const { env } = defineEnv({
			presets: [
				getCloudflarePreset({
					compatibilityDate: workerConfig.compatibilityDate,
					compatibilityFlags: workerConfig.compatibilityFlags,
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

		for (const [injectedName, moduleSpecifier] of Object.entries(
			this.#env.inject
		)) {
			const [module, exportName, importName] = Array.isArray(moduleSpecifier)
				? [moduleSpecifier[0], moduleSpecifier[1], moduleSpecifier[1]]
				: [moduleSpecifier, "default", "defaultExport"];

			if (!injectsByModule.has(module)) {
				injectsByModule.set(module, []);
				virtualModulePathToSpecifier.set(
					`${VIRTUAL_NODEJS_GLOBAL_INJECT_PREFIX}${module}`,
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
export function hasNodeJsCompat(workerConfig: CompatConfig) {
	const nodeCompatMode = getNodeCompat(
		workerConfig.compatibilityDate,
		workerConfig.compatibilityFlags ?? []
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
