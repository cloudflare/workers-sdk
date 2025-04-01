import assert from "node:assert";
import { cloudflareBuiltInModules } from "./cloudflare-environment";
import { isNodeCompat, NODEJS_MODULES_RE } from "./node-js-compat";
import type { WorkerPluginConfig } from "./plugin-config";
import type * as vite from "vite";

/**
 * Validates that worker environments don't include configuration options which are
 * incompatible with the Cloudflare plugin, if any worker includes such options an
 * error with a comprehensive message is thrown
 *
 * @param resolvedPluginConfig the resolved plugin config
 * @param resolvedViteConfig the vite resolved config
 */
export function validateWorkerEnvironmentsResolvedConfigs(
	resolvedPluginConfig: WorkerPluginConfig,
	resolvedViteConfig: vite.ResolvedConfig
) {
	const workersEnvironmentNames = Object.keys(resolvedPluginConfig.workers);

	type ProblematicEnvConfigs = {
		optimizeDepsExclude?: vite.DepOptimizationOptions["exclude"];
		resolveExternal?: vite.ResolveOptions["external"];
	};

	const problematicEnvsConfigs = new Map<string, ProblematicEnvConfigs>();

	for (const envName of workersEnvironmentNames) {
		const workerEnvConfig = resolvedViteConfig.environments[envName];
		assert(workerEnvConfig, `Missing environment config for "${envName}"`);

		const { optimizeDeps, resolve } = workerEnvConfig;

		const problematicConfig: ProblematicEnvConfigs = {};

		const problematicOptimizeDepsExcludeEntries = (
			optimizeDeps.exclude ?? []
		).filter((entry) => {
			if (cloudflareBuiltInModules.includes(entry)) {
				// cloudflare builtin modules are always allowed
				return false;
			}

			if (
				NODEJS_MODULES_RE.test(entry) &&
				isNodeCompat(resolvedPluginConfig.workers[envName])
			) {
				// node builtin modules are allowed when but nodejs compat is enabled
				return false;
			}

			// everything else is problematic
			return true;
		});
		if (problematicOptimizeDepsExcludeEntries.length > 0) {
			problematicConfig.optimizeDepsExclude =
				problematicOptimizeDepsExcludeEntries;
		}

		if (resolve.external === true || resolve.external.length > 0) {
			problematicConfig.resolveExternal = resolve.external;
		}

		if (Object.keys(problematicConfig).length > 0) {
			problematicEnvsConfigs.set(envName, problematicConfig);
		}
	}

	if (problematicEnvsConfigs.size > 0) {
		const errorMessage = `The following environment configurations are incompatible with the Cloudflare Vite plugin:\n${[
			...problematicEnvsConfigs,
		]
			.map(([envName, problematicConfig]) =>
				[
					problematicConfig.optimizeDepsExclude
						? `	- "${envName}" environment: \`optimizeDeps.exclude\`: ${JSON.stringify(problematicConfig.optimizeDepsExclude)}\n`
						: null,
					problematicConfig.resolveExternal
						? `	- "${envName}" environment: \`resolve.external\`: ${JSON.stringify(problematicConfig.resolveExternal)}\n`
						: null,
				].join("")
			)
			.join(
				""
			)}To resolve this issue, avoid setting \`optimizeDeps.exclude\` and \`resolve.external\` in your Cloudflare Worker environments.\n`;

		throw new Error(errorMessage);
	}
}
