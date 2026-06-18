import assert from "node:assert";
import { builtinModules } from "node:module";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";

// Node.js built-in module names in both bare and `node:` prefixed forms.
// Vitest 4 automatically adds these to `resolve.external` for non-standard
// environments (via its `runnerTransform` plugin). They are harmless for
// Worker environments — Workers either handle them via the node-compat layer
// or don't use them — so validation is skipped when the array contains only
// these entries.
const NODE_BUILTIN_SET = new Set([
	...builtinModules,
	// Only add the `node:` prefix for modules that don't already have it,
	// avoiding hypothetical `node:node:*` entries on future Node versions.
	...builtinModules
		.filter((m) => !m.startsWith("node:"))
		.map((m) => `node:${m}`),
]);

function isOnlyNodeBuiltins(
	external: vite.ResolveOptions["external"]
): boolean {
	if (!Array.isArray(external)) {
		return false;
	}
	return external.every(
		(entry) => typeof entry === "string" && NODE_BUILTIN_SET.has(entry)
	);
}

interface DisallowedEnvironmentOptions {
	resolveExternal?: vite.ResolveOptions["external"];
}

/**
 * Throws an error if Worker environments include configuration options that are incompatible with the plugin.
 */
export function validateWorkerEnvironmentOptions(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig
) {
	const disallowedEnvironmentOptionsMap = new Map<
		string,
		DisallowedEnvironmentOptions
	>();

	for (const environmentName of resolvedPluginConfig.environmentNameToWorkerMap.keys()) {
		const environmentOptions = resolvedViteConfig.environments[environmentName];
		assert(
			environmentOptions,
			`Missing environment config for "${environmentName}"`
		);
		const { resolve } = environmentOptions;
		const disallowedEnvironmentOptions: DisallowedEnvironmentOptions = {};

		if (
			(resolve.external === true ||
				(Array.isArray(resolve.external) && resolve.external.length > 0)) &&
			!isOnlyNodeBuiltins(resolve.external)
		) {
			disallowedEnvironmentOptions.resolveExternal = resolve.external;
		}

		if (Object.keys(disallowedEnvironmentOptions).length) {
			disallowedEnvironmentOptionsMap.set(
				environmentName,
				disallowedEnvironmentOptions
			);
		}
	}

	if (disallowedEnvironmentOptionsMap.size) {
		const errorMessage = `The following environment options are incompatible with the Cloudflare Vite plugin:\n${[
			...disallowedEnvironmentOptionsMap,
		]
			.map(
				([environmentName, disallowedEnvironmentOptions]) =>
					disallowedEnvironmentOptions.resolveExternal &&
					`	- "${environmentName}" environment: \`resolve.external\`: ${JSON.stringify(disallowedEnvironmentOptions.resolveExternal)}\n`
			)
			.join(
				""
			)}To resolve this issue, avoid setting \`resolve.external\` in your Cloudflare Worker environments.\n`;

		throw new Error(errorMessage);
	}
}
