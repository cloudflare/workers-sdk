import assert from "node:assert";
import * as path from "node:path";
import { parseStaticRouting } from "@cloudflare/workers-shared/utils/configuration/parseStaticRouting";
import * as vite from "vite";
import { getWorkerConfigs } from "./deploy-config";
import { hasNodeJsCompat, NodeJsCompat } from "./nodejs-compat";
import {
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
	/** Experimental support for remote bindings (where bindings configured with `remote: true` access remote resources). */
	remoteBindings?: boolean;
}

export interface PluginConfig extends EntryWorkerConfig {
	auxiliaryWorkers?: AuxiliaryWorkerConfig[];
	persistState?: PersistState;
	inspectorPort?: number | false;
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

interface BaseResolvedConfig {
	persistState: PersistState;
	inspectorPort: number | false | undefined;
	experimental: Experimental;
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
	workers: Record<string, WorkerConfig>;
	entryWorkerEnvironmentName: string;
	nodeJsCompatMap: Map<string, NodeJsCompat>;
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

// Worker names can only contain alphanumeric characters and '-' whereas environment names can only contain alphanumeric characters and '$', '_'
function workerNameToEnvironmentName(workerName: string) {
	return workerName.replaceAll("-", "_");
}

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

	if (viteEnv.isPreview) {
		return {
			...shared,
			type: "preview",
			workers: getWorkerConfigs(root),
		};
	}

	const configPaths = new Set<string>();
	const { CLOUDFLARE_ENV: cloudflareEnv } = vite.loadEnv(
		viteEnv.mode,
		root,
		/* prefixes */ ""
	);

	const entryWorkerConfigPath = getValidatedWranglerConfigPath(
		root,
		pluginConfig.configPath
	);

	const entryWorkerResolvedConfig = getWorkerConfig(
		entryWorkerConfigPath,
		cloudflareEnv,
		{
			visitedConfigPaths: configPaths,
			isEntryWorker: true,
		}
	);

	if (entryWorkerResolvedConfig.type === "assets-only") {
		return {
			...shared,
			type: "assets-only",
			cloudflareEnv,
			config: entryWorkerResolvedConfig.config,
			configPaths,
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

	const workers = {
		[entryWorkerEnvironmentName]: entryWorkerConfig,
	};

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

		if (workers[workerEnvironmentName]) {
			throw new Error(
				`Duplicate Vite environment name found: ${workerEnvironmentName}`
			);
		}

		workers[workerEnvironmentName] = workerConfig;
	}

	const nodeJsCompatMap = new Map(
		Object.entries(workers)
			.filter(([_, workerConfig]) => hasNodeJsCompat(workerConfig))
			.map(([environmentName, workerConfig]) => [
				environmentName,
				new NodeJsCompat(workerConfig),
			])
	);

	return {
		...shared,
		type: "workers",
		cloudflareEnv,
		configPaths,
		workers,
		entryWorkerEnvironmentName,
		nodeJsCompatMap,
		staticRouting,
		rawConfigs: {
			entryWorker: entryWorkerResolvedConfig,
			auxiliaryWorkers: auxiliaryWorkersResolvedConfigs,
		},
	};
}

export function assertIsNotPreview(
	resolvedPluginConfig: ResolvedPluginConfig
): asserts resolvedPluginConfig is
	| AssetsOnlyResolvedConfig
	| WorkersResolvedConfig {
	assert(
		resolvedPluginConfig.type !== "preview",
		`Expected "assets-only" or "workers" plugin config`
	);
}

export function assertIsPreview(
	resolvedPluginConfig: ResolvedPluginConfig
): asserts resolvedPluginConfig is PreviewResolvedConfig {
	assert(
		resolvedPluginConfig.type === "preview",
		`Expected "preview" plugin config`
	);
}
