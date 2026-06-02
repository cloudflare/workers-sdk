import * as path from "node:path";
import {
	cloudflareBuiltInModules,
	defaultConditions,
	WORKER_ENTRY_NAME,
} from "./constants";
import type { ResolvedPluginConfig } from "./config";
import type {
	EnvironmentConfig,
	RsbuildConfig,
	RsbuildEntryDescription,
} from "@rsbuild/core";

export function createWorkerEnvironmentConfig(
	resolvedConfig: ResolvedPluginConfig,
	rsbuildConfig: RsbuildConfig
): EnvironmentConfig {
	const entry: RsbuildEntryDescription = {
		import: path.resolve(resolvedConfig.root, resolvedConfig.workerConfig.main),
		html: false,
	};

	return {
		source: {
			entry: {
				[WORKER_ENTRY_NAME]: entry,
			},
			define: getProcessEnvReplacements(),
		},
		output: {
			target: "web-worker",
			distPath: {
				root: getOutputDirectory(rsbuildConfig, resolvedConfig.environmentName),
			},
			emitAssets: true,
			manifest: true,
			filenameHash: false,
			polyfill: "off",
		},
		resolve: {
			conditionNames: [...defaultConditions],
		},
		tools: {
			rspack(config) {
				config.externalsType = "module";
				config.externals = [
					...(Array.isArray(config.externals) ? config.externals : []),
					({ request }, callback) => {
						if (
							request &&
							cloudflareBuiltInModules.some(
								(moduleName) =>
									request === moduleName || request.startsWith(`${moduleName}/`)
							)
						) {
							callback(undefined, request);
							return;
						}
						callback();
					},
				];
				config.output.module = true;
				config.output.chunkFormat = "module";
				config.output.chunkLoading = "import";
				config.output.workerChunkLoading = "import";
				config.output.filename = "[name].js";
				config.output.chunkFilename = "[name].js";
				config.output.library = { type: "module" };
				config.optimization ??= {};
				config.optimization.runtimeChunk = false;
			},
		},
	};
}

export function getOutputDirectory(
	config: RsbuildConfig,
	environmentName: string
): string {
	const rootDistPath = getRootDistPath(config);
	return path.join(rootDistPath, environmentName);
}

function getRootDistPath(config: RsbuildConfig): string {
	const distPath = config.output?.distPath;
	if (typeof distPath === "string") {
		return distPath;
	}
	return distPath?.root ?? "dist";
}

function getProcessEnvReplacements(): Record<string, string> {
	const nodeEnv = process.env.NODE_ENV ?? "production";
	return {
		"process.env.NODE_ENV": JSON.stringify(nodeEnv),
		"global.process.env.NODE_ENV": JSON.stringify(nodeEnv),
		"globalThis.process.env.NODE_ENV": JSON.stringify(nodeEnv),
		"process.env": "{}",
		"global.process.env": "{}",
		"globalThis.process.env": "{}",
	};
}
