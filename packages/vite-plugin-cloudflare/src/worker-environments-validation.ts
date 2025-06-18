import assert from "node:assert";
import { cloudflareBuiltInModules } from "./cloudflare-environment";
import {
	isNodeAls,
	isNodeAlsModule,
	isNodeCompat,
	NODEJS_MODULES_RE,
} from "./node-js-compat";
import type { WorkersResolvedConfig } from "./plugin-config";
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
	resolvedPluginConfig: WorkersResolvedConfig,
	resolvedViteConfig: vite.ResolvedConfig
) {
	const workersEnvironmentNames = Object.keys(resolvedPluginConfig.workers);

	type DisallowedEnvConfigs = {
		optimizeDepsExclude?: vite.DepOptimizationOptions["exclude"];
		resolveExternal?: vite.ResolveOptions["external"];
	};

	const disallowedEnvsConfigs = new Map<string, DisallowedEnvConfigs>();

	for (const envName of workersEnvironmentNames) {
		const workerEnvConfig = resolvedViteConfig.environments[envName];
		assert(workerEnvConfig, `Missing environment config for "${envName}"`);

		const { optimizeDeps, resolve } = workerEnvConfig;

		const disallowedConfig: DisallowedEnvConfigs = {};

		const disallowedOptimizeDepsExcludeEntries = (
			optimizeDeps.exclude ?? []
		).filter((entry) => {
			if (cloudflareBuiltInModules.includes(entry)) {
				// cloudflare builtin modules are always allowed
				return false;
			}

			if (
				isNodeAlsModule(entry) &&
				isNodeAls(resolvedPluginConfig.workers[envName])
			) {
				// `node:async_hooks` is allowed when nodejs_als compat is enabled
				return false;
			}

			if (
				NODEJS_MODULES_RE.test(entry) &&
				isNodeCompat(resolvedPluginConfig.workers[envName])
			) {
				// node builtin modules are allowed when nodejs compat is enabled
				return false;
			}

			// everything else is disallowed
			return true;
		});
		if (disallowedOptimizeDepsExcludeEntries.length > 0) {
			disallowedConfig.optimizeDepsExclude =
				disallowedOptimizeDepsExcludeEntries;
		}

		if (resolve.external === true || resolve.external.length > 0) {
			disallowedConfig.resolveExternal = resolve.external;
		}

		if (Object.keys(disallowedConfig).length > 0) {
			disallowedEnvsConfigs.set(envName, disallowedConfig);
		}
	}

	if (disallowedEnvsConfigs.size > 0) {
		const errorMessage = `The following environment configurations are incompatible with the Cloudflare Vite plugin:\n${[
			...disallowedEnvsConfigs,
		]
			.map(([envName, disallowedConfig]) =>
				[
					disallowedConfig.optimizeDepsExclude
						? `	- "${envName}" environment: \`optimizeDeps.exclude\`: ${JSON.stringify(disallowedConfig.optimizeDepsExclude)}\n`
						: null,
					disallowedConfig.resolveExternal
						? `	- "${envName}" environment: \`resolve.external\`: ${JSON.stringify(disallowedConfig.resolveExternal)}\n`
						: null,
				].join("")
			)
			.join(
				""
			)}To resolve this issue, avoid setting \`optimizeDeps.exclude\` and \`resolve.external\` in your Cloudflare Worker environments.\n`;

		throw new Error(errorMessage);
	}
}
