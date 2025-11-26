import assert from "node:assert";
import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import * as vite from "vite";
import { getWorkerConfigs } from "./deploy-config";
import { hasNodeJsCompat, NodeJsCompat } from "./nodejs-compat";
import {
	getDefaultWorkerConfig,
	getValidatedWranglerConfigPath,
	getWorkerConfig,
} from "./workers-configs";
import type { Defined } from "./utils";
import type {
	AssetsOnlyWorkerResolvedConfig,
	SanitizedWorkerConfig,
	WorkerResolvedConfig,
	WorkerWithServerLogicResolvedConfig,
} from "./workers-configs";
import type { StaticRouting } from "@cloudflare/workers-shared/utils/types";
import type { Unstable_Config } from "wrangler";

export type PersistState = boolean | { path: string };

interface BaseWorkerConfig {
	viteEnvironment?: { name?: string };
}

interface EntryWorkerConfig extends BaseWorkerConfig {
	configPath?: string;
}

interface AuxiliaryWorkerConfig extends BaseWorkerConfig {
	configPath: string;
}

interface Experimental {
	/** Experimental support for handling the _headers and _redirects files during Vite dev mode. */
	headersAndRedirectsDevModeSupport?: boolean;
}

export interface PluginConfig extends EntryWorkerConfig {
	auxiliaryWorkers?: AuxiliaryWorkerConfig[];
	persistState?: PersistState;
	inspectorPort?: number | false;
	remoteBindings?: boolean;
	experimental?: Experimental;
}

export interface AssetsOnlyConfig extends SanitizedWorkerConfig {
	topLevelName: Defined<SanitizedWorkerConfig["topLevelName"]>;
	name: Defined<SanitizedWorkerConfig["name"]>;
	compatibility_date: Defined<SanitizedWorkerConfig["compatibility_date"]>;
}

export interface WorkerConfig extends AssetsOnlyConfig {
	main: Defined<SanitizedWorkerConfig["main"]>;
}

export interface Worker {
	config: WorkerConfig;
	nodeJsCompat: NodeJsCompat | undefined;
}

interface BaseResolvedConfig {
	persistState: PersistState;
	inspectorPort: number | false | undefined;
	experimental: Experimental;
	remoteBindings: boolean;
}

export interface AssetsOnlyResolvedConfig extends BaseResolvedConfig {
	type: "assets-only";
	configPaths: Set<string>;
	cloudflareEnv: string | undefined;
	config: AssetsOnlyConfig;
	rawConfigs: {
		entryWorker: AssetsOnlyWorkerResolvedConfig;
	};
}

export interface WorkersResolvedConfig extends BaseResolvedConfig {
	type: "workers";
	configPaths: Set<string>;
	cloudflareEnv: string | undefined;
	environmentNameToWorkerMap: Map<string, Worker>;
	entryWorkerEnvironmentName: string;
	staticRouting: StaticRouting | undefined;
	rawConfigs: {
		entryWorker: WorkerWithServerLogicResolvedConfig;
		auxiliaryWorkers: WorkerResolvedConfig[];
	};
}

export interface PreviewResolvedConfig extends BaseResolvedConfig {
	type: "preview";
	workers: Unstable_Config[];
}

export type ResolvedPluginConfig =
	| AssetsOnlyResolvedConfig
	| WorkersResolvedConfig
	| PreviewResolvedConfig;

export function resolvePluginConfig(
	pluginConfig: PluginConfig,
	userConfig: vite.UserConfig,
	viteEnv: vite.ConfigEnv
): ResolvedPluginConfig {
	const shared = {
		persistState: pluginConfig.persistState ?? true,
		inspectorPort: pluginConfig.inspectorPort,
		experimental: pluginConfig.experimental ?? {},
	};
	const root = userConfig.root ? path.resolve(userConfig.root) : process.cwd();
	const prefixedEnv = vite.loadEnv(viteEnv.mode, root, [
		"CLOUDFLARE_",
		// TODO: Remove deprecated WRANGLER prefix support in next major version
		"WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_",
	]);

	// Merge the loaded env variables into process.env so that they are available to
	// wrangler when it loads the worker configuration files.
	Object.assign(process.env, prefixedEnv);

	if (viteEnv.isPreview) {
		return {
			...shared,
			remoteBindings: pluginConfig.remoteBindings ?? true,
			type: "preview",
			workers: getWorkerConfigs(root),
		};
	}

	const configPaths = new Set<string>();
	const cloudflareEnv = prefixedEnv.CLOUDFLARE_ENV;
	const entryWorkerConfigPath = getValidatedWranglerConfigPath(
		root,
		pluginConfig.configPath
	);

	// Handle zero-config mode when no wrangler config file is found
	const entryWorkerResolvedConfig =
		entryWorkerConfigPath === undefined
			? getDefaultWorkerConfig(root)
			: getWorkerConfig(entryWorkerConfigPath, cloudflareEnv, {
					visitedConfigPaths: configPaths,
					isEntryWorker: true,
				});

	if (entryWorkerResolvedConfig.type === "assets-only") {
		return {
			...shared,
			type: "assets-only",
			cloudflareEnv,
			config: entryWorkerResolvedConfig.config,
			configPaths,
			remoteBindings: pluginConfig.remoteBindings ?? true,
			rawConfigs: {
				entryWorker: entryWorkerResolvedConfig,
			},
		};
	}

	const entryWorkerConfig = entryWorkerResolvedConfig.config;

	const entryWorkerEnvironmentName =
		pluginConfig.viteEnvironment?.name ??
		workerNameToEnvironmentName(entryWorkerConfig.topLevelName);

	let staticRouting: StaticRouting | undefined;

	if (Array.isArray(entryWorkerConfig.assets?.run_worker_first)) {
		staticRouting = parseStaticRouting(
			entryWorkerConfig.assets.run_worker_first
		);
	}

	const environmentNameToWorkerMap: Map<string, Worker> = new Map([
		[entryWorkerEnvironmentName, resolveWorker(entryWorkerConfig)],
	]);

	const auxiliaryWorkersResolvedConfigs: WorkerResolvedConfig[] = [];

	for (const auxiliaryWorker of pluginConfig.auxiliaryWorkers ?? []) {
		const workerConfigPath = getValidatedWranglerConfigPath(
			root,
			auxiliaryWorker.configPath,
			true
		);
		const workerResolvedConfig = getWorkerConfig(
			workerConfigPath,
			cloudflareEnv,
			{
				visitedConfigPaths: configPaths,
			}
		);

		auxiliaryWorkersResolvedConfigs.push(workerResolvedConfig);

		assert(
			workerResolvedConfig.type === "worker",
			"Unexpected error: received AssetsOnlyResult with auxiliary workers."
		);

		const workerConfig = workerResolvedConfig.config;

		const workerEnvironmentName =
			auxiliaryWorker.viteEnvironment?.name ??
			workerNameToEnvironmentName(workerConfig.topLevelName);

		if (environmentNameToWorkerMap.has(workerEnvironmentName)) {
			throw new Error(
				`Duplicate Vite environment name found: ${workerEnvironmentName}`
			);
		}

		environmentNameToWorkerMap.set(
			workerEnvironmentName,
			resolveWorker(workerConfig)
		);
	}

	return {
		...shared,
		type: "workers",
		cloudflareEnv,
		configPaths,
		environmentNameToWorkerMap,
		entryWorkerEnvironmentName,
		staticRouting,
		remoteBindings: pluginConfig.remoteBindings ?? true,
		rawConfigs: {
			entryWorker: entryWorkerResolvedConfig,
			auxiliaryWorkers: auxiliaryWorkersResolvedConfigs,
		},
	};
}

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll("-", "_");
}

function resolveWorker(workerConfig: WorkerConfig) {
	return {
		config: workerConfig,
		nodeJsCompat: hasNodeJsCompat(workerConfig)
			? new NodeJsCompat(workerConfig)
			: undefined,
	};
}
