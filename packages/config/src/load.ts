/**
 * @module
 *
 * The no-cache import logic in this file is adapted from `import-without-cache`
 * by Kevin Deng (https://github.com/sxzz/import-without-cache), published under
 * the MIT License and Copyright © 2025-PRESENT Kevin Deng.
 *
 * See https://github.com/sxzz/import-without-cache for the original code.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { LoadHookContext } from "node:module";

const CF_WORKER_SCHEME = "cf-worker:";
const CF_WORKER_TYPE = "cf-worker";
const CF_ATTR = "cf";
const CF_NO_CACHE_VALUE = "no-cache";
const CF_NO_CACHE_QUERY_KEY = "cf-no-cache";
const RE_NODE_MODULES = /[/\\]node_modules[/\\]/;

const depsStore = new AsyncLocalStorage<Set<string>>();

/**
 * Dynamically import a worker config file from disk.
 *
 * Returns the module's default export, plus the set of file paths
 * imported during resolution. Callers are responsible for unwrapping
 * function/promise wrappers around the returned value and validating it
 * against `InputWorkerSchema`.
 *
 * @param configPath Filesystem path to the config file. Relative paths are
 *   resolved against `process.cwd()`.
 */
export async function loadConfig(
	configPath: string
): Promise<LoadConfigResult> {
	registerConfigHooks();
	const url = pathToFileURL(configPath).href;
	const dependencies = new Set<string>();
	const mod = await depsStore.run(
		dependencies,
		() => import(url, { with: { [CF_ATTR]: CF_NO_CACHE_VALUE } })
	);
	return { config: mod.default, dependencies };
}

export interface LoadConfigResult {
	/** The default export of the config module */
	config: unknown;
	/**
	 * Absolute file paths imported while resolving the config.
	 * `cf-worker` entrypoints are NOT included — they are
	 * referenced for their specifier only and changes to their source should
	 * not trigger a config reload.
	 */
	dependencies: Set<string>;
}

let deregister: (() => void) | undefined;

/**
 * Register Node module hooks for loading Worker configs. Idempotent —
 * repeated calls return the same deregister function.
 *
 *  - Handles `with { type: "cf-worker" }` import attributes by synthesising an
 *    ES module whose default export is the entrypoint specifier. Relative
 *    specifiers (`./`, `../`) are anchored to the importing module and emitted
 *    as absolute paths; bare specifiers and virtual-module specifiers pass
 *    through unchanged so consumers can apply their own resolution semantics.
 *    The referenced module is NOT loaded, is NOT executed, and is NOT added to
 *    the dependencies set.
 *  - Handles `with { cf: "no-cache" }` import attributes (set internally by
 *    `loadConfig`) by tagging the resolved URL with a unique UUID query
 *    string so Node treats each import as a fresh module. The UUID is
 *    propagated to all transitive imports via the parent URL, ensuring the
 *    entire subgraph is re-evaluated. Imports inside `node_modules` are
 *    skipped (treated as immutable for config purposes).
 */
export function registerConfigHooks(): () => void {
	if (deregister) {
		return deregister;
	}
	if (typeof process !== "undefined" && process.versions.bun) {
		throw new Error(
			"cloudflare.config.ts loading is not supported on Bun. " +
				"Please use Node.js v22.18.0 or higher."
		);
	}
	if (typeof registerHooks !== "function") {
		throw new Error(
			"cloudflare.config.ts loading requires Node.js v22.18.0 or higher."
		);
	}

	const hooks = registerHooks({
		resolve(specifier, context, nextResolve) {
			// `importAttributes` may be absent for some resolution paths (e.g.
			// CJS `require()` going through the hook chain after the hook has
			// been registered for ESM use).
			const importAttributes = context.importAttributes ?? {};

			if (importAttributes.type === CF_WORKER_TYPE) {
				// Path-only reference. The entrypoint is never loaded or
				// executed, so we don't add it to dependencies (changes to the
				// entrypoint's source should not trigger a config reload).
				//
				// Relative specifiers (`./`, `../`) are anchored to the
				// importing module via `parentURL`, producing an absolute path.
				// This keeps resolution correct even when the import is written
				// in a file other than the top-level config (e.g. a re-exported
				// nested config), where resolving relative to the config file
				// downstream would be wrong.
				const isRelative =
					specifier.startsWith("./") || specifier.startsWith("../");
				const entrypoint =
					isRelative && context.parentURL
						? fileURLToPath(new URL(specifier, context.parentURL))
						: specifier;

				return {
					url: `${CF_WORKER_SCHEME}${encodeURIComponent(entrypoint)}`,
					format: "module",
					shortCircuit: true,
				};
			}

			const isNoCache = importAttributes[CF_ATTR] === CF_NO_CACHE_VALUE;

			// `registerHooks` runs the chain synchronously, so the result is
			// not a Promise even though the Node type allows for it.
			const resolved = nextResolve(specifier, context) as {
				url: string;
				format?: string | null;
				importAttributes?: Record<string, string | undefined>;
				shortCircuit?: boolean;
			};

			// Cache-busting + dependency tracking for the config's own graph.
			if (RE_NODE_MODULES.test(resolved.url)) {
				return resolved;
			}
			if (!resolved.url.startsWith("file://")) {
				return resolved;
			}

			const parentUuid = getParentUUID(context.parentURL);

			if (!parentUuid && !isNoCache) {
				return resolved;
			}

			depsStore.getStore()?.add(fileURLToPath(resolved.url));
			resolved.url = appendUUID(
				resolved.url,
				parentUuid || crypto.randomUUID()
			);

			return resolved;
		},
		load(url, context, nextLoad) {
			if (url.startsWith(CF_WORKER_SCHEME)) {
				const specifier = decodeURIComponent(
					url.slice(CF_WORKER_SCHEME.length)
				);

				return {
					format: "module",
					source: `export default ${JSON.stringify(specifier)};`,
					shortCircuit: true,
				};
			}

			cleanupImportAttributes(context);

			return nextLoad(url, context);
		},
	});

	deregister = () => {
		hooks.deregister();
		deregister = undefined;
	};

	return deregister;
}

function getParentUUID(parentURL: string | undefined): string | undefined {
	if (!parentURL) {
		return;
	}

	return (
		new URL(parentURL).searchParams.get(CF_NO_CACHE_QUERY_KEY) ?? undefined
	);
}

function appendUUID(url: string, uuid: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set(CF_NO_CACHE_QUERY_KEY, uuid);

	return parsed.toString();
}

function cleanupImportAttributes(context: LoadHookContext): void {
	if (!context.importAttributes?.[CF_ATTR]) {
		return;
	}

	const attrs = Object.assign(Object.create(null), context.importAttributes);
	delete attrs[CF_ATTR];
	context.importAttributes = attrs;
	Object.freeze(context.importAttributes);
}
