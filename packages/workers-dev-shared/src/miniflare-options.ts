import assert from "node:assert";
import * as path from "node:path";
import {
	createContainerPreviewPlanForCfConfig,
	resolveDockerHost,
} from "@cloudflare/containers-shared";
import {
	getBrowserRenderingHeadfulFromEnv,
	getLocalExplorerEnabledFromEnv,
	getLocalObservabilityEnabledFromEnv,
} from "@cloudflare/workers-utils";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { getDefaultDevRegistryPath } from "miniflare";
import { kRequestType, PROXY_SHARED_SECRET } from "./constants";
import {
	resolveLocalBindingsByWorkerName,
	warnForMissingSecrets,
} from "./local-env";
import { createMiniflareExports } from "./miniflare-exports";
import { getStructuredLogsLogger } from "./miniflare-logger";
import { getMiniflareManifest } from "./miniflare-manifest";
import { getPersistenceRoot } from "./persist";
import { getRemoteProxySessionData, getWorkerZone } from "./remote-bindings";
import type { ResolvedLocalBindings } from "./local-env";
import type { DevLogger } from "./logger";
import type { PersistState } from "./persist";
import type {
	PreviewResolvedConfig,
	ResolvedWorkerConfig,
} from "./plugin-config";
import type {
	ContainerDevOptions,
	ContainerDevPlan,
	ContainerDevRuntimeOptions,
} from "@cloudflare/containers-shared";
import type { Log, MiniflareOptions, WorkerOptions } from "miniflare";
import type * as http from "node:http";

const ASSETS_ONLY_MODULE = "__VITE_ASSETS_ONLY__.js";

/**
 * Gets the Miniflare instance options that are the same in dev and preview for every bundler.
 *
 * @param options.root The project root
 * @param options.persistState The user's `persistState` option
 * @param options.logger The Miniflare logger
 * @param options.inspectorPort The inspector port, or `false` if the inspector is disabled
 * @param options.publicUrl The dev server's public URL
 * @param options.containerEngine The container engine, if any Containers are configured
 * @returns The instance options
 */
export function getCommonMiniflareOptions(options: {
	root: string;
	persistState: PersistState;
	logger: Log;
	inspectorPort: number | false;
	publicUrl: string | undefined;
	containerEngine?: MiniflareOptions["containerEngine"];
}) {
	const { root, logger, inspectorPort } = options;

	return {
		log: logger,
		publicUrl: options.publicUrl,
		unsafeProxySharedSecret: PROXY_SHARED_SECRET,
		inspectorPort: inspectorPort === false ? undefined : inspectorPort,
		unsafeDevRegistryPath: getDefaultDevRegistryPath(),
		unsafeTriggerHandlers: true,
		unsafeLocalExplorer: getLocalExplorerEnabledFromEnv(),
		// The switch for local observability capture: tells Miniflare core to
		// attach the trace collector to each user worker. Opt-in via the
		// `X_LOCAL_OBSERVABILITY` env var (defaults off); enabling it requires
		// restarting the dev server.
		unsafeObservability: getLocalObservabilityEnabledFromEnv(),
		telemetry: { enabled: false },
		handleStructuredLogs: getStructuredLogsLogger(logger),
		resourcePersistencePath: getPersistenceRoot(root, options.persistState),
		resourceTmpPath: path.resolve(root, ".cloudflare/tmp"),
		containerEngine: options.containerEngine,
	} satisfies Partial<MiniflareOptions>;
}

/**
 * Gets the Miniflare options for previewing the Build Output.
 *
 * @param options.resolvedPluginConfig The resolved plugin config for the Build Output
 * @param options.root The project root
 * @param options.mode The mode used to load env files
 * @param options.logger The bundler's logger
 * @param options.miniflareLogger The Miniflare logger
 * @param options.inspectorPort The inspector port, or `false` if the inspector is disabled
 * @param options.publicUrl The preview server's public URL
 * @returns The Miniflare options and the Containers to prepare
 */
export async function getPreviewMiniflareOptions(options: {
	resolvedPluginConfig: PreviewResolvedConfig;
	root: string;
	mode: string;
	logger: DevLogger;
	miniflareLogger: Log;
	inspectorPort: number | false;
	publicUrl: string | undefined;
}): Promise<{
	miniflareOptions: Extract<MiniflareOptions, { workers: WorkerOptions[] }>;
	containerOptions: ContainerDevOptions[] | undefined;
}> {
	const { resolvedPluginConfig, root, logger } = options;
	const inputInspectorPort = options.inspectorPort;
	const resolvedLocalBindingsByWorkerName = resolveLocalBindingsByWorkerName(
		resolvedPluginConfig.workers.map((worker) => worker.config),
		resolvedPluginConfig.localEnv,
		resolvedPluginConfig.devVars
	);
	warnForMissingSecrets(
		resolvedLocalBindingsByWorkerName,
		options.mode,
		logger
	);
	const containerPlansByWorkerName = new Map<string, ContainerDevPlan>();
	const containerOptions: ContainerDevOptions[] = [];
	for (const previewWorker of resolvedPluginConfig.workers) {
		const plan = createContainerPreviewPlanForCfConfig({
			containers: resolvedPluginConfig.containers,
			exports: previewWorker.config.exports,
		});
		if (plan !== undefined) {
			containerPlansByWorkerName.set(previewWorker.config.name, plan);
			containerOptions.push(...plan.containerOptions);
		}
	}
	const containerEngine =
		containerPlansByWorkerName.size === 0
			? undefined
			: resolveDockerHost(getDockerPath());
	const workers: WorkerOptions[] = await Promise.all(
		resolvedPluginConfig.workers.map(async (previewWorker) => {
			const workerConfig = previewWorker.config;
			const remoteProxySessionData = await getRemoteProxySessionData(
				workerConfig,
				{
					remoteBindings: resolvedPluginConfig.remoteBindings,
					settings: resolvedPluginConfig.settings,
					root,
					cliDisplayName: resolvedPluginConfig.cliDisplayName,
					logger,
				}
			);

			const { manifest: _manifest, assets, exports, ...config } = workerConfig;
			const resolvedLocalBindings = resolvedLocalBindingsByWorkerName.get(
				workerConfig.name
			);
			assert(resolvedLocalBindings);
			const env = { ...resolvedLocalBindings.bindings };
			const workerExports = createMiniflareExports({
				exports,
				containerRuntimeOptions: containerPlansByWorkerName.get(
					workerConfig.name
				)?.containerRuntimeOptions,
			});
			return {
				config: {
					...config,
					exports: workerExports,
					env,
					manifest: previewWorker.bundle
						? await getMiniflareManifest(previewWorker.bundle)
						: previewWorker.assetsDir
							? getAssetsOnlyManifest(root)
							: undefined,
					assets: previewWorker.assetsDir
						? {
								...assets,
								directory: previewWorker.assetsDir,
								hasUserWorker: previewWorker.bundle !== undefined,
							}
						: undefined,
				},
				dev: {
					zone: getWorkerZone(config),
					remoteProxyConnectionString:
						remoteProxySessionData?.session?.remoteProxyConnectionString,
					unsafeInspectorProxy: inputInspectorPort !== false,
				},
			} satisfies WorkerOptions;
		})
	);

	const miniflareOptions: MiniflareOptions = {
		...getCommonMiniflareOptions({
			root,
			persistState: resolvedPluginConfig.persistState,
			logger: options.miniflareLogger,
			inspectorPort: inputInspectorPort,
			publicUrl: options.publicUrl,
			containerEngine,
		}),
		workers,
	};

	return {
		miniflareOptions: miniflareOptions as Extract<
			MiniflareOptions,
			{ workers: WorkerOptions[] }
		>,
		containerOptions:
			containerPlansByWorkerName.size === 0 ? undefined : containerOptions,
	};
}

type DevUserWorkerOptions = {
	config: Omit<
		ResolvedWorkerConfig,
		"entrypoint" | "assets" | "env" | "exports"
	> & {
		env: ResolvedLocalBindings["bindings"];
		exports: ReturnType<typeof createMiniflareExports>;
	};
	dev: Pick<
		NonNullable<WorkerOptions["dev"]>,
		"zone" | "remoteProxyConnectionString" | "unsafeInspectorProxy"
	>;
};

/**
 * Gets the dev options for a user Worker that are the same for every bundler.
 * The bundler adds the Worker's modules, and anything else it needs, on top.
 *
 * @param workerConfig The Worker's resolved config
 * @param options.resolvedLocalBindings The Worker's local bindings
 * @param options.remoteProxy The options for the Worker's remote proxy session
 * @param options.handleAssetRequest Serves the Worker's assets binding from the dev server
 * @param options.inspectorPort The inspector port, or `false` if the inspector is disabled
 * @param options.containerRuntimeOptions The Worker's Container runtime options, if any
 * @returns The Worker's options, without its modules
 */
export async function getDevUserWorkerOptions(
	workerConfig: ResolvedWorkerConfig,
	options: {
		resolvedLocalBindings: ResolvedLocalBindings | undefined;
		remoteProxy: Parameters<typeof getRemoteProxySessionData>[1];
		handleAssetRequest: (
			req: http.IncomingMessage,
			res: http.ServerResponse
		) => void;
		inspectorPort: number | false;
		containerRuntimeOptions:
			| Map<string, ContainerDevRuntimeOptions>
			| undefined;
	}
): Promise<DevUserWorkerOptions> {
	const remoteProxySessionData = await getRemoteProxySessionData(
		workerConfig,
		options.remoteProxy
	);

	const { entrypoint: _entrypoint, assets: _assets, ...config } = workerConfig;
	const { resolvedLocalBindings } = options;
	assert(resolvedLocalBindings);
	const env = { ...resolvedLocalBindings.bindings };
	for (const [name, binding] of Object.entries(env)) {
		if (binding.type === "assets") {
			env[name] = {
				type: "node-handler",
				handler: (req, res) => {
					req[kRequestType] = "asset";
					options.handleAssetRequest(req, res);
				},
			};
		} else if (
			binding.type === "browser" &&
			getBrowserRenderingHeadfulFromEnv()
		) {
			env[name] = { ...binding, headful: true };
		}
	}

	return {
		config: {
			...config,
			env,
			exports: createMiniflareExports({
				exports: config.exports,
				containerRuntimeOptions: options.containerRuntimeOptions,
			}),
		},
		dev: {
			zone: getWorkerZone(config),
			remoteProxyConnectionString:
				remoteProxySessionData?.session?.remoteProxyConnectionString,
			unsafeInspectorProxy: options.inspectorPort !== false,
		},
	};
}

function getAssetsOnlyManifest(
	rootPath: string
): NonNullable<WorkerOptions["config"]["manifest"]> {
	return {
		mainModule: ASSETS_ONLY_MODULE,
		modulesRoot: rootPath,
		modules: {
			[ASSETS_ONLY_MODULE]: {
				type: "esm",
				contents: "export default {};",
			},
		},
	};
}
