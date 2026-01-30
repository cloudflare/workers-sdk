import assert from "node:assert";
import type {
	AssetsOnlyResolvedConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type * as vite from "vite";

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

		if (resolve.external === true || resolve.external.length) {
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
