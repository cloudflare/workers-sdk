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

const CLOUDFLARE_VIRTUAL_PREFIX = "\0__CLOUDFLARE_NODEJS_COMPAT__";

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
 * If the current environment needs Node.js compatibility,
 * then inject the necessary global polyfills into the code.
 */
export function injectGlobalCode(id: string, code: string) {
	const injectedCode = Object.entries(env.inject)
		.map(([globalName, globalInject]) => {
			if (typeof globalInject === "string") {
				const moduleSpecifier = globalInject;
				// the mapping is a simple string, indicating a default export, so the string is just the module specifier.
				return `import var_${globalName} from "${CLOUDFLARE_VIRTUAL_PREFIX}${moduleSpecifier}";\nglobalThis.${globalName} = var_${globalName};\n`;
			}

			// the mapping is a 2 item tuple, indicating a named export, made up of a module specifier and an export name.
			const [moduleSpecifier, exportName] = globalInject;
			return `import var_${globalName} from "${CLOUDFLARE_VIRTUAL_PREFIX}${moduleSpecifier}";\nglobalThis.${globalName} = var_${globalName}.${exportName};\n`;
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
 * We only want to alias Node.js built-ins if the environment has Node.js compatibility turned on.
 * But Vite only allows us to configure aliases at the shared options level, not per environment.
 * So instead we alias these to a virtual module, which are then handled with environment specific code in the `resolveId` handler
 */
export function getNodeCompatAliases() {
	const aliases: Record<string, string> = {};
	Object.keys(env.alias).forEach((key) => {
		// Don't create aliases for modules that are already marked as external
		if (!env.external.includes(key)) {
			aliases[key] = CLOUDFLARE_VIRTUAL_PREFIX + key;
		}
	});
	return aliases;
}

/**
 * Get an array of modules that should be considered external.
 */
export function getNodeCompatExternals(): string[] {
	return env.external;
}

/**
 * If the `source` module id starts with the virtual prefix then strip it and return the rest of the id.
 * Otherwise return undefined.
 */
export function maybeStripNodeJsVirtualPrefix(
	source: string
): string | undefined {
	return source.startsWith(CLOUDFLARE_VIRTUAL_PREFIX)
		? source.slice(CLOUDFLARE_VIRTUAL_PREFIX.length)
		: undefined;
}

/**
 * Resolve the source import to an absolute path, potentially via its alias.
 */
export function resolveNodeJSImport(source: string) {
	const alias = env.alias[source];
	if (alias) {
		// If `alias` is `undefined` then `source` was injected in the `transform` hook and we can resolve it directly.
		// Else we resolve the `alias` instead of the `source`.
		assert(
			!env.external.includes(alias),
			`Unexpected unenv alias to external module: ${source} -> ${alias}`
		);
		source = alias;
	}
	// Resolve to an absolute path using the path to this file as the resolution starting point.
	// This is essential so that we can find the `@cloudflare/unenv-preset` and `unenv` packages,
	// which are dependencies of this package but may not be direct dependencies of the user's project.
	const resolved = resolvePathSync(source, {
		url: import.meta.url,
	});

	return {
		unresolved: source,
		resolved,
	};
}
