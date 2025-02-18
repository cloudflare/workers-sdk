import assert from "node:assert";
import { cloudflare } from "@cloudflare/unenv-preset";
import MagicString from "magic-string";
import { getNodeCompat } from "miniflare";
import { resolvePathSync } from "mlly";
import { defineEnv } from "unenv";
import type { WorkerConfig } from "./plugin-config";

const { env } = defineEnv({
	nodeCompat: true,
	presets: [cloudflare],
});

/**
 * Returns true if the given combination of compat dates and flags means that we need Node.js compatibility.
 */
export function isNodeCompat(
	workerConfig: WorkerConfig | undefined
): workerConfig is WorkerConfig {
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
	if (nodeCompatMode === "legacy") {
		throw new Error(
			"Unsupported Node.js compat mode (legacy). Remove the `node_compat` setting and add the `nodejs_compat` flag instead."
		);
	}
	if (nodeCompatMode === "v1") {
		throw new Error(
			`Unsupported Node.js compat mode (v1). Only the v2 mode is supported, either change your compat date to "2024-09-23" or later, or set the "nodejs_compat_v2" compatibility flag`
		);
	}
	return false;
}

/**
 * Gets a set of module specifiers for all possible Node.js compat polyfill entry-points
 */
export function getNodeCompatEntries() {
	const entries = new Set<string>(Object.values(env.alias));
	for (const globInject of Object.values(env.inject)) {
		if (typeof globInject === "string") {
			entries.add(globInject);
		} else {
			assert(
				globInject[0] !== undefined,
				"Expected first element of globInject to be defined"
			);
			entries.add(globInject[0]);
		}
	}
	for (const external of env.external) {
		entries.delete(external);
	}
	return entries;
}

/**
 * Gets the necessary global polyfills to inject into the entry-point of the user's code.
 */
export function injectGlobalCode(id: string, code: string) {
	const injectedCode = Object.entries(env.inject)
		.map(([globalName, globalInject]) => {
			if (typeof globalInject === "string") {
				const moduleSpecifier = globalInject;
				// the mapping is a simple string, indicating a default export, so the string is just the module specifier.
				return `import var_${globalName} from "${moduleSpecifier}";\nglobalThis.${globalName} = var_${globalName};\n`;
			}

			// the mapping is a 2 item tuple, indicating a named export, made up of a module specifier and an export name.
			const [moduleSpecifier, exportName] = globalInject;
			assert(
				moduleSpecifier !== undefined,
				"Expected moduleSpecifier to be defined"
			);
			assert(exportName !== undefined, "Expected exportName to be defined");
			return `import var_${globalName} from "${moduleSpecifier}";\nglobalThis.${globalName} = var_${globalName}.${exportName};\n`;
		})
		.join("\n");

	const modified = new MagicString(code);
	modified.prepend(injectedCode);
	return {
		code: modified.toString(),
		map: modified.generateMap({ hires: "boundary", source: id }),
	};
}

/**
 * Gets an array of modules that should be considered external.
 */
export function getNodeCompatExternals(): string[] {
	return env.external;
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
	if (alias) {
		return {
			unresolved: alias,
			resolved: resolvePathSync(alias, { url: import.meta.url }),
		};
	}
}
