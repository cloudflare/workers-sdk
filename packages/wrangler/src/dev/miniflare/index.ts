import path from "node:path";
import {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	buildSitesOptions,
	getDefaultProjectTmpPath,
} from "@cloudflare/deploy-helpers/miniflare-options";
import {
	getBrowserRenderingHeadfulFromEnv,
	getLocalExplorerEnabledFromEnv,
	getLocalObservabilityEnabledFromEnv,
} from "@cloudflare/workers-utils";
import { Log, LogLevel } from "miniflare";
import { ModuleTypeToRuleType } from "../../deployment-bundle/module-collection";
import { withSourceURLs } from "../../deployment-bundle/source-url";
import { logger } from "../../logger";
import { getMetricsConfig } from "../../metrics";
import { getSourceMappedString } from "../../sourcemap";
import { updateCheck } from "../../update-check";
import type { StartDevWorkerInput } from "../../api/startDevWorker/types";
import type { LoggerLevel } from "../../logger";
import type { EsbuildBundle } from "../use-esbuild";
import type { ContainerDevRuntimeOptions } from "@cloudflare/containers-shared";
import type {
	AssetsOptions,
	CfScriptFormat,
	ConnectHandler,
	Config,
	ContainerEngine,
	LegacyAssetPaths,
	ServiceFetch,
} from "@cloudflare/workers-utils";
import type {
	RemoteProxyConnectionString,
	V4MiniflareOptions,
	V4SourceOptions,
	V4WorkerOptions,
	WorkerdStructuredLog,
	WorkerRegistry,
} from "miniflare";
import type { UUID } from "node:crypto";

export {
	buildAssetOptions,
	buildMiniflareBindingOptions,
	getDefaultProjectTmpPath,
	getIdentifier,
} from "@cloudflare/deploy-helpers/miniflare-options";

// This worker proxies all external Durable Objects to the Wrangler session
// where they're defined, and receives all requests from other Wrangler sessions
// for this session's Durable Objects. Note the original request URL may contain
// non-standard protocols, so we store it in a header to restore later.
// It also provides stub classes for services that couldn't be found, for
// improved error messages when trying to call RPC methods.
const EXTERNAL_SERVICE_WORKER_NAME =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";

type SpecificPort = Exclude<number, 0>;
type RandomConsistentPort = 0; // random port, but consistent across reloads
type RandomDifferentPort = undefined; // random port, but different across reloads
type Port = SpecificPort | RandomConsistentPort | RandomDifferentPort;

export interface ConfigBundle {
	// TODO(soon): maybe rename some of these options, check proposed API Google Docs
	name: string | undefined;
	projectRoot: string;
	bundle: EsbuildBundle;
	format: CfScriptFormat | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	complianceRegion: Config["compliance_region"] | undefined;
	bindings: StartDevWorkerInput["bindings"];
	migrations: Config["migrations"] | undefined;
	exports: Config["exports"] | undefined;
	devRegistry: string | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number | undefined;
	inspectorHost: string | undefined;
	localPersistencePath: string | false;
	crons: Config["triggers"]["crons"];
	routes: string[] | undefined;
	queueConsumers: Config["queues"]["consumers"];
	connectHandlers: ConnectHandler[];
	localProtocol: "http" | "https";
	localUpstream: string | undefined;
	upstreamProtocol: "http" | "https";
	inspect: boolean;
	outboundService: ServiceFetch | undefined;
	tails: Config["tail_consumers"] | undefined;
	streamingTails: Config["streaming_tail_consumers"] | undefined;
	testScheduled: boolean;
	containerRuntimeOptions?: Map<string, ContainerDevRuntimeOptions>;
	containerEngine: ContainerEngine | undefined;
	enableContainers: boolean;
	// Zone to use for the CF-Worker header in outbound fetches
	zone: string | undefined;
	access: Config["access"] | undefined;
	sendMetrics: boolean | undefined;
	// The stable, externally-reachable URL of the proxy server in front of
	// this Miniflare instance (e.g. Wrangler's ProxyWorker URL).
	publicUrl: string | undefined;
	structuredLogsHandler: ((log: WorkerdStructuredLog) => void) | undefined;
}

export class WranglerLog extends Log {
	#warnedCompatibilityDateFallback = false;

	log(message: string) {
		// Hide request logs for external Durable Objects proxy worker
		if (message.includes(EXTERNAL_SERVICE_WORKER_NAME)) {
			return;
		}
		super.log(message);
	}

	warn(message: string) {
		// Only log warning about requesting a compatibility date after the workerd
		// binary's version once, and only if there's an update available.
		if (message.startsWith("The latest compatibility date supported by")) {
			if (this.#warnedCompatibilityDateFallback) {
				return;
			}
			this.#warnedCompatibilityDateFallback = true;
			return void updateCheck().then((result) => {
				if (result.status !== "update-available") {
					return;
				}
				message += [
					"",
					"Features enabled by your requested compatibility date may not be available.",
					`Upgrade to \`wrangler@${result.latest}\` to remove this warning.`,
				].join("\n");
				super.warn(message);
			});
		}
		super.warn(message);
	}
}

const DEFAULT_WORKER_NAME = "worker";
function getName(config: Pick<ConfigBundle, "name">) {
	return config.name ?? DEFAULT_WORKER_NAME;
}
export function castLogLevel(level: LoggerLevel): LogLevel {
	let key = level.toUpperCase() as Uppercase<LoggerLevel>;
	if (key === "LOG") {
		key = "INFO";
	}

	return LogLevel[key];
}

export function buildLog(): Log {
	const level = castLogLevel(logger.loggerLevel);

	return new WranglerLog(level, {
		prefix: level === LogLevel.DEBUG ? "wrangler-UserWorker" : "wrangler",
	});
}

async function buildSourceOptions(
	config: Omit<ConfigBundle, "rules">
): Promise<{ sourceOptions: V4SourceOptions; entrypointNames: string[] }> {
	const scriptPath = config.bundle.path;
	if (config.format === "modules") {
		const isPython = config.bundle.type === "python";

		const { entrypointSource, modules } = isPython
			? {
					entrypointSource: config.bundle.entrypointSource,
					modules: config.bundle.modules,
				}
			: withSourceURLs(
					scriptPath,
					config.bundle.entrypointSource,
					config.bundle.modules
				);

		const entrypointNames = isPython ? [] : config.bundle.entry.exports;

		const modulesRoot = path.dirname(scriptPath);
		const sourceOptions: V4SourceOptions = {
			modulesRoot,

			modules: [
				// Entrypoint
				{
					type: ModuleTypeToRuleType[config.bundle.type],
					path: scriptPath,
					contents: entrypointSource,
				},
				// Misc (WebAssembly, etc, ...)
				...modules.map((module) => ({
					type: ModuleTypeToRuleType[module.type ?? "esm"],
					path: path.resolve(modulesRoot, module.name),
					contents: module.content,
				})),
			],
		};
		return { sourceOptions, entrypointNames };
	} else {
		// Miniflare will handle adding `//# sourceURL` comments if they're missing
		return {
			sourceOptions: { script: config.bundle.entrypointSource, scriptPath },
			entrypointNames: [],
		};
	}
}

export function getDefaultPersistRoot(
	localPersistencePath: ConfigBundle["localPersistencePath"]
): string | undefined {
	if (localPersistencePath !== false) {
		const v3Path = path.join(localPersistencePath, "v3");
		return v3Path;
	}
}

export type Options = V4MiniflareOptions & { workers: V4WorkerOptions[] };

export async function buildMiniflareOptions(
	log: Log,
	config: Omit<ConfigBundle, "rules">,
	proxyToUserWorkerAuthenticationSecret: UUID,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	onDevRegistryUpdate?: (registry: WorkerRegistry) => void
): Promise<Options> {
	const upstream =
		typeof config.localUpstream === "string"
			? `${config.upstreamProtocol}://${config.localUpstream}`
			: undefined;

	const { sourceOptions } = await buildSourceOptions(config);
	const { bindingOptions, externalWorkers } = buildMiniflareBindingOptions(
		config,
		remoteProxyConnectionString
	);
	if (bindingOptions.browserRendering && getBrowserRenderingHeadfulFromEnv()) {
		bindingOptions.browserRendering.headful = true;
	}
	const sitesOptions = buildSitesOptions(config);
	const resourcePersistencePath = getDefaultPersistRoot(
		config.localPersistencePath
	);
	const resourceTmpPath = getDefaultProjectTmpPath(config.projectRoot);
	const assetOptions = buildAssetOptions(config);

	const options: Options = {
		rootPath: config.projectRoot,
		host: config.initialIp,
		port: config.initialPort,
		publicUrl: config.publicUrl,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		inspectorHost: config.inspect ? config.inspectorHost : undefined,
		upstream,
		unsafeDevRegistryPath: config.devRegistry,
		unsafeHandleDevRegistryUpdate: onDevRegistryUpdate,
		unsafeProxySharedSecret: proxyToUserWorkerAuthenticationSecret,
		unsafeTriggerHandlers: true,
		unsafeLocalExplorer: getLocalExplorerEnabledFromEnv(),
		// The one switch for local observability: this env var tells Miniflare core
		// to attach the trace collector to each user worker.
		unsafeObservability: getLocalObservabilityEnabledFromEnv(),
		unsafeInspectDurableObjects: true,
		telemetry: getMetricsConfig({ sendMetrics: config.sendMetrics }),
		// The way we run Miniflare instances with wrangler dev is that there are two:
		//  - one holding the proxy worker,
		//  - and one holding the user worker.
		// The issue with that setup is that end users would see two sets of request logs from Miniflare!
		// Instead of hiding all logs from this Miniflare instance, we specifically hide the request logs,
		// allowing other logs to be shown to the user (such as details about emails being triggered)
		logRequests: false,
		log,
		verbose: logger.loggerLevel === "debug",
		handleStructuredLogs: config.structuredLogsHandler ?? handleStructuredLogs,
		resourcePersistencePath,
		resourceTmpPath,
		containerEngine: config.containerEngine,
		workers: [
			{
				name: getName(config),
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,

				...sourceOptions,
				...bindingOptions,
				...sitesOptions,
				...assetOptions,
				routes: config.routes,
				cronTriggers: config.crons,
				outboundService: config.outboundService,
				zone: config.zone,
				access: config.access?.dev,
				connectHandlers: config.connectHandlers,
			},
			...externalWorkers,
		],
	};
	return options;
}

/**
 * handler for workerd's structured logs to pass to miniflare
 *
 * @param structuredLog log to print
 */
export function handleStructuredLogs({ level, message }: WorkerdStructuredLog) {
	if (level === "warn") {
		return logger.warn(message);
	}

	if (level === "info") {
		return logger.info(message);
	}

	if (level === "debug") {
		// note that debug logs are logged at the info level, this is like so because before structured logs
		// were introduced developers were used to call `console.debug` and get their logs in the terminal
		// during local development and we don't want to break such workflow in a non-major release
		// (For more context see: https://github.com/cloudflare/workers-sdk/issues/10690)
		//
		// TODO: for the next major release we do want the debug logs to be logged at the debug level instead,
		//       we should also introduce some mechanism to allows users to get their worker debug logs without
		//       also getting all the wrangler debug logs
		return logger.info(message);
	}

	if (level === "error") {
		return logger.error(getSourceMappedString(message));
	}

	return logger.log(getSourceMappedString(message));
}
