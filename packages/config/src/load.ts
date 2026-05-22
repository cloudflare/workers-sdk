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

const CF_WORKER_SCHEME = "cf-worker:";
const CF_WORKER_TYPE = "cf-worker";
const CF_WORKER_CONFIG_TYPE = "cf-worker-config";
const NO_CACHE_QUERY_KEY = "cf-worker-config";
const RE_NODE_MODULES = /[/\\]node_modules[/\\]/;

const depsStore = new AsyncLocalStorage<Set<string>>();
let deregister: (() => void) | undefined;

export interface LoadConfigResult {
	/** The default export of the config module, exactly as the user wrote it. */
	config: unknown;
	/**
	 * Absolute file paths imported while resolving the config. Useful for
	 * watch-mode rebuilds. `cf-worker` entrypoints are NOT included — they are
	 * referenced for their path only and changes to their source should not
	 * trigger a config reload.
	 */
	dependencies: Set<string>;
}

/**
 * Register Node module hooks for loading worker configs. Idempotent —
 * repeated calls return the same deregister function.
 *
 *  - Handles `with { type: "cf-worker" }` import attributes by synthesising an
 *    ES module whose default export is the resolved location of the referenced
 *    module — a filesystem path for `file://` URLs, or the URL string itself
 *    for other schemes (e.g. virtual modules from Vite). The referenced
 *    module is NOT executed and is NOT added to the dependencies set.
 *  - Handles `with { type: "cf-worker-config" }` import attributes (set
 *    internally by `loadConfig`) by tagging the resolved URL with a unique
 *    UUID query string so Node treats each import as a fresh module. The
 *    UUID is propagated to all transitive imports via the parent URL,
 *    ensuring the entire subgraph is re-evaluated. Imports inside
 *    `node_modules` are skipped (treated as immutable for config purposes).
 */
export function registerConfigHooks(): () => void {
	if (deregister) {
		return deregister;
	}
	if (typeof process !== "undefined" && process.versions.bun) {
		throw new Error(
			"worker.config.ts loading is not yet supported on Bun. " +
				"Please use Node.js v22.18.0 or higher."
		);
	}
	if (typeof registerHooks !== "function") {
		throw new Error("worker.config.ts requires Node.js v22.18.0 or higher.");
	}

	const hooks = registerHooks({
		resolve(specifier, context, nextResolve) {
			// `importAttributes` may be absent for some resolution paths (e.g.
			// CJS `require()` going through the hook chain after the hook has
			// been registered for ESM use).
			const importAttributes = context.importAttributes ?? {};
			const importType = importAttributes.type;
			const isCfWorker = importType === CF_WORKER_TYPE;
			const isConfigLoad = importType === CF_WORKER_CONFIG_TYPE;

			// Strip our private `type` attribute values before delegating —
			// Node's default resolver rejects unknown `type` attribute values.
			const cleaned =
				isCfWorker || isConfigLoad
					? {
							...context,
							importAttributes: stripAttr(importAttributes, "type"),
						}
					: context;

			// `registerHooks` runs the chain synchronously, so the result is
			// not a Promise even though the Node type allows for it.
			const resolved = nextResolve(specifier, cleaned) as {
				url: string;
				format?: string | null;
				importAttributes?: Record<string, string | undefined>;
				shortCircuit?: boolean;
			};

			if (isCfWorker) {
				// Path-only reference. The entrypoint is never loaded, so we
				// don't add it to dependencies (changes to the entrypoint's
				// source must not trigger a config reload).
				const entrypointId = resolved.url.startsWith("file://")
					? fileURLToPath(resolved.url)
					: resolved.url;
				return {
					...resolved,
					url: `${CF_WORKER_SCHEME}${encodeURIComponent(entrypointId)}`,
					format: "module",
					shortCircuit: true,
				};
			}

			// Cache-busting + dependency tracking for the config's own graph.
			if (RE_NODE_MODULES.test(resolved.url)) {
				return resolved;
			}
			if (!resolved.url.startsWith("file://")) {
				return resolved;
			}
			const parentUUID = getParentUUID(context.parentURL);
			if (!parentUUID && !isConfigLoad) {
				return resolved;
			}
			depsStore.getStore()?.add(fileURLToPath(resolved.url));
			const uuid = parentUUID ?? crypto.randomUUID();
			resolved.url = appendUUID(resolved.url, uuid);
			return resolved;
		},
		load(url, context, nextLoad) {
			if (url.startsWith(CF_WORKER_SCHEME)) {
				const entrypointId = decodeURIComponent(
					url.slice(CF_WORKER_SCHEME.length)
				);
				return {
					format: "module",
					source: `export default ${JSON.stringify(entrypointId)};`,
					shortCircuit: true,
				};
			}
			// For `cf-worker-config` top-level imports, strip our private
			// `type` attribute before delegating so the default loader doesn't
			// see an attribute value it doesn't recognise. (`cf-worker`
			// imports are short-circuited above and never reach this branch.)
			const importAttributes = context.importAttributes ?? {};
			if (importAttributes.type === CF_WORKER_CONFIG_TYPE) {
				const cleaned = {
					...context,
					importAttributes: stripAttr(importAttributes, "type"),
				};
				return nextLoad(url, cleaned);
			}
			return nextLoad(url, context);
		},
	});

	deregister = () => {
		hooks.deregister();
		deregister = undefined;
	};
	return deregister;
}

/**
 * Dynamically import a worker config file from disk.
 *
 * Returns the module's default export untouched, plus the set of file paths
 * imported during resolution. Callers are responsible for unwrapping
 * function/promise wrappers around the returned value and validating it
 * against `ConfigSchema`.
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
		() => import(url, { with: { type: CF_WORKER_CONFIG_TYPE } })
	);
	return { config: mod.default, dependencies };
}

function getParentUUID(parentURL: string | undefined): string | undefined {
	if (!parentURL) {
		return undefined;
	}
	try {
		return new URL(parentURL).searchParams.get(NO_CACHE_QUERY_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

function appendUUID(url: string, uuid: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set(NO_CACHE_QUERY_KEY, uuid);
	return parsed.toString();
}

function stripAttr<T extends Record<string, string | undefined>>(
	attrs: T,
	key: keyof T
): T {
	const out: Record<string, unknown> = Object.assign(
		Object.create(null),
		attrs
	);
	delete out[key as string];
	return Object.freeze(out) as T;
}
