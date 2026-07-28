import assert from "node:assert";
import path from "node:path";
import { getDevContainerImageName } from "@cloudflare/containers-shared";
import {
	extractBindingsOfType,
	isUnsafeBindingType,
} from "@cloudflare/deploy-helpers";
import {
	getBrowserRenderingHeadfulFromEnv,
	getLocalExplorerEnabledFromEnv,
	getWranglerHiddenDirPath,
} from "@cloudflare/workers-utils";
import { Log, LogLevel } from "miniflare";
import { CfModuleTypeToManifestType } from "../../deployment-bundle/module-collection";
import { withSourceURLs } from "../../deployment-bundle/source-url";
import { logger } from "../../logger";
import { getMetricsConfig } from "../../metrics";
import { getSourceMappedString } from "../../sourcemap";
import { updateCheck } from "../../update-check";
import { warnOrError } from "../../utils/print-bindings";
import { getDurableObjectClassNameToUseSQLiteMap } from "../class-names-sqlite";
import type { StartDevWorkerInput } from "../../api/startDevWorker/types";
import type { LoggerLevel } from "../../logger";
import type { EsbuildBundle } from "../use-esbuild";
import type {
	AssetsOptions,
	Binding,
	CfScriptFormat,
	Config,
	ContainerEngine,
	LegacyAssetPaths,
	ServiceFetch,
} from "@cloudflare/workers-utils";
import type {
	DevConfig,
	DOContainerOptions,
	Json,
	LegacyConfig,
	MiniflareOptions,
	MiniflareWorkerConfig,
	RemoteProxyConnectionString,
	WorkerdStructuredLog,
	WorkerOptions,
	WorkerRegistry,
} from "miniflare";

/** A single `config.env` binding entry (input shape). */
type MiniflareEnv = NonNullable<MiniflareWorkerConfig["env"]>;
type MiniflareBinding = MiniflareEnv[string];
/** A single `config.exports` entry (input shape). */
type MiniflareExports = NonNullable<MiniflareWorkerConfig["exports"]>;
/** The inline module manifest. */
type MiniflareManifest = NonNullable<MiniflareWorkerConfig["manifest"]>;
/** A single `config.triggers` entry (input shape). */
type MiniflareTrigger = NonNullable<MiniflareWorkerConfig["triggers"]>[number];
/** A single `config.tailConsumers` entry (input shape). */
type MiniflareTailConsumer = NonNullable<
	MiniflareWorkerConfig["tailConsumers"]
>[number];
import type { UUID } from "node:crypto";

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
	localProtocol: "http" | "https";
	localUpstream: string | undefined;
	upstreamProtocol: "http" | "https";
	inspect: boolean;
	outboundService: ServiceFetch | undefined;
	tails: Config["tail_consumers"] | undefined;
	streamingTails: Config["streaming_tail_consumers"] | undefined;
	testScheduled: boolean;
	containerDOClassNames: Set<string> | undefined;
	containerBuildId: string | undefined;
	containerEngine: ContainerEngine | undefined;
	enableContainers: boolean;
	// Zone to use for the CF-Worker header in outbound fetches
	zone: string | undefined;
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
const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
export function getIdentifier(name: string) {
	return name.replace(IDENTIFIER_UNSAFE_REGEXP, "_");
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

/** Posix-style module name relative to `modulesRoot` (workerd module names use `/`). */
function moduleName(modulesRoot: string, modulePath: string): string {
	return path.relative(modulesRoot, modulePath).split(path.sep).join("/");
}

async function buildSourceOptions(
	config: Omit<ConfigBundle, "rules">
): Promise<{
	manifest?: MiniflareManifest;
	serviceWorkerScript?: string;
	entrypointNames: string[];
}> {
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
		const mainModule = moduleName(modulesRoot, scriptPath);

		const manifestModules: MiniflareManifest["modules"] = {
			// Entrypoint. workerd uses the first module as the entrypoint; the
			// manifest's `mainModule` records which key that is.
			[mainModule]: {
				type: CfModuleTypeToManifestType[config.bundle.type],
				contents: entrypointSource,
			},
		};
		// Misc (WebAssembly, etc, ...)
		for (const module of modules) {
			const name = moduleName(
				modulesRoot,
				path.resolve(modulesRoot, module.name)
			);
			manifestModules[name] = {
				type: CfModuleTypeToManifestType[module.type ?? "esm"],
				contents: module.content,
			};
		}

		return {
			manifest: { mainModule, modules: manifestModules },
			entrypointNames,
		};
	} else {
		// Service-worker format: Miniflare adds `//# sourceURL` comments if missing.
		return {
			serviceWorkerScript: config.bundle.entrypointSource,
			entrypointNames: [],
		};
	}
}

function getRemoteId(id: string | symbol | undefined): string | null {
	return typeof id === "string" ? id : null;
}

type MiniflareBindingsConfig = Pick<
	ConfigBundle,
	| "bindings"
	| "migrations"
	| "exports"
	| "name"
	| "containerDOClassNames"
	| "containerBuildId"
	| "enableContainers"
> &
	Partial<Pick<ConfigBundle, "format" | "bundle">>;

/**
 * Translate wrangler's flat binding list into the Miniflare v5 per-worker
 * shape: `config.env` (the binding map) plus `config.exports` (declarative
 * Durable Object / entrypoint definitions). Module/blob bindings for the
 * service-worker format are surfaced separately and threaded into
 * `legacy.{wasmBindings,textBlobBindings,dataBlobBindings}` by the caller.
 *
 * Remote proxying is expressed per-binding via `remote`; the actual
 * connection string is set once on the worker's `dev` block by the caller
 * (see `getRemoteProxyConnectionString`).
 */
export function buildMiniflareBindingOptions(config: MiniflareBindingsConfig): {
	env: MiniflareEnv;
	exports: MiniflareExports;
	wasmBindings: Record<string, string | Uint8Array<ArrayBuffer>>;
	textBlobBindings: Record<string, string>;
	dataBlobBindings: Record<string, string | Uint8Array<ArrayBuffer>>;
	externalWorkers: WorkerOptions[];
} {
	const bindings = config.bindings;

	const env: MiniflareEnv = {};
	const exports: MiniflareExports = {};

	const textBlobs = extractBindingsOfType("text_blob", bindings);
	const dataBlobs = extractBindingsOfType("data_blob", bindings);
	const wasmModules = extractBindingsOfType("wasm_module", bindings);
	const plainTextBindings = extractBindingsOfType("plain_text", bindings);
	const secretTextBindings = extractBindingsOfType("secret_text", bindings);
	const jsonBindings = extractBindingsOfType("json", bindings);
	const kvNamespaces = extractBindingsOfType("kv_namespace", bindings);
	const r2Buckets = extractBindingsOfType("r2_bucket", bindings);
	const d1Databases = extractBindingsOfType("d1", bindings);
	const queues = extractBindingsOfType("queue", bindings);
	const pipelines = extractBindingsOfType("pipeline", bindings);
	const hyperdrives = extractBindingsOfType("hyperdrive", bindings);
	const durableObjects = extractBindingsOfType(
		"durable_object_namespace",
		bindings
	);
	const services = extractBindingsOfType("service", bindings);
	const analyticsEngineDatasets = extractBindingsOfType(
		"analytics_engine",
		bindings
	);
	const dispatchNamespaces = extractBindingsOfType(
		"dispatch_namespace",
		bindings
	);
	const mtlsCertificates = extractBindingsOfType("mtls_certificate", bindings);
	const vectorizeBindings = extractBindingsOfType("vectorize", bindings);
	const vpcServices = extractBindingsOfType("vpc_service", bindings);
	const vpcNetworks = extractBindingsOfType("vpc_network", bindings);
	const secretsStoreSecrets = extractBindingsOfType(
		"secrets_store_secret",
		bindings
	);
	const helloWorldBindings = extractBindingsOfType(
		"unsafe_hello_world",
		bindings
	);
	const flagshipBindings = extractBindingsOfType("flagship", bindings);
	const artifactsBindings = extractBindingsOfType("artifacts", bindings);
	const workerLoaders = extractBindingsOfType("worker_loader", bindings);
	const sendEmailBindings = extractBindingsOfType("send_email", bindings);
	// Extract both regular and unsafe ratelimit bindings
	// Unsafe bindings have type "unsafe_ratelimit" (prefixed with "unsafe_")
	const ratelimits = [
		...extractBindingsOfType("ratelimit", bindings),
		...extractBindingsOfType("unsafe_ratelimit", bindings),
	];
	const aiBindings = extractBindingsOfType("ai", bindings);
	const aiSearchNamespaceBindings = extractBindingsOfType(
		"ai_search_namespace",
		bindings
	);
	const aiSearchInstanceBindings = extractBindingsOfType("ai_search", bindings);
	const websearchBindings = extractBindingsOfType("websearch", bindings);
	const agentMemoryBindings = extractBindingsOfType("agent_memory", bindings);
	const imagesBindings = extractBindingsOfType("images", bindings);
	const mediaBindings = extractBindingsOfType("media", bindings);
	const browserBindings = extractBindingsOfType("browser", bindings);
	const versionMetadataBindings = extractBindingsOfType(
		"version_metadata",
		bindings
	);
	const streamBindings = extractBindingsOfType("stream", bindings);
	const fetchers = extractBindingsOfType("fetcher", bindings);

	// Setup blob and module bindings (service-worker format only)
	// TODO: check all these blob bindings just work, they're relative to cwd
	const textBlobBindings: Record<string, string> = {};
	for (const blob of textBlobs) {
		if ("path" in blob.source && blob.source.path) {
			textBlobBindings[blob.binding] = blob.source.path;
		} else if ("contents" in blob.source) {
			textBlobBindings[blob.binding] = blob.source.contents;
		}
	}

	const dataBlobBindings: Record<string, string | Uint8Array<ArrayBuffer>> = {};
	for (const blob of dataBlobs) {
		if ("path" in blob.source && blob.source.path) {
			dataBlobBindings[blob.binding] = blob.source.path;
		} else if ("contents" in blob.source) {
			dataBlobBindings[blob.binding] = blob.source
				.contents as Uint8Array<ArrayBuffer>;
		}
	}

	const wasmBindings: Record<string, string | Uint8Array<ArrayBuffer>> = {};
	for (const wasm of wasmModules) {
		if ("path" in wasm.source && wasm.source.path) {
			wasmBindings[wasm.binding] = wasm.source.path;
		} else if ("contents" in wasm.source) {
			wasmBindings[wasm.binding] = wasm.source
				.contents as Uint8Array<ArrayBuffer>;
		}
	}

	if (config.format === "service-worker" && config.bundle) {
		// For the service-worker format, blobs are accessible on the global scope
		const scriptPath = config.bundle.path;
		const modulesRoot = path.dirname(scriptPath);
		for (const { type, name } of config.bundle.modules) {
			if (type === "text") {
				textBlobBindings[getIdentifier(name)] = path.resolve(modulesRoot, name);
			} else if (type === "buffer") {
				dataBlobBindings[getIdentifier(name)] = path.resolve(modulesRoot, name);
			} else if (type === "compiled-wasm") {
				wasmBindings[getIdentifier(name)] = path.resolve(modulesRoot, name);
			}
		}
	}

	// Vars: plain_text, secret_text (both plain text locally), and json.
	for (const binding of plainTextBindings) {
		env[binding.binding] = { type: "text", value: binding.value };
	}
	for (const binding of secretTextBindings) {
		env[binding.binding] = { type: "text", value: binding.value };
	}
	for (const binding of jsonBindings) {
		env[binding.binding] = { type: "json", value: binding.value as Json };
	}

	// KV / R2 / D1
	for (const kv of kvNamespaces) {
		env[kv.binding] = {
			type: "kv",
			id: getRemoteId(kv.id) ?? kv.binding,
			remote: kv.remote,
		};
	}
	for (const r2 of r2Buckets) {
		env[r2.binding] = {
			type: "r2",
			name: getRemoteId(r2.bucket_name) ?? r2.binding,
			jurisdiction: r2.jurisdiction,
			remote: r2.remote,
		};
	}
	for (const d1 of d1Databases) {
		env[d1.binding] = {
			type: "d1",
			id: getRemoteId(d1.preview_database_id ?? d1.database_id) ?? d1.binding,
			remote: d1.remote,
		};
	}

	// Queue producers (consumers become `queue` triggers in buildMiniflareOptions)
	for (const queue of queues) {
		env[queue.binding] = {
			type: "queue",
			name: getRemoteId(queue.queue_name) ?? queue.binding,
			deliveryDelay: queue.delivery_delay,
			remote: queue.remote,
		};
	}

	// Pipelines
	for (const pipeline of pipelines) {
		env[pipeline.binding] = {
			type: "pipeline",
			name: pipeline.pipeline ?? pipeline.stream ?? pipeline.binding,
			remote: pipeline.remote,
		};
	}

	// Hyperdrive
	for (const hyperdrive of hyperdrives) {
		env[hyperdrive.binding] = {
			type: "hyperdrive",
			id: hyperdrive.id,
			localConnectionString: hyperdrive.localConnectionString ?? "",
		};
	}

	// Analytics Engine
	for (const dataset of analyticsEngineDatasets) {
		env[dataset.binding] = {
			type: "analytics-engine-dataset",
			name: dataset.dataset ?? "dataset",
		};
	}

	// Dispatch namespaces
	for (const dispatchNamespace of dispatchNamespaces) {
		warnOrError("dispatch_namespace", dispatchNamespace.remote);
		env[dispatchNamespace.binding] = {
			type: "dispatch-namespace",
			namespace:
				getRemoteId(dispatchNamespace.namespace) ?? dispatchNamespace.binding,
			remote: dispatchNamespace.remote,
		};
	}

	// mTLS certificates
	for (const mtlsCertificate of mtlsCertificates) {
		warnOrError("mtls_certificate", mtlsCertificate.remote);
		env[mtlsCertificate.binding] = {
			type: "mtls-certificate",
			id: mtlsCertificate.certificate_id,
			remote: mtlsCertificate.remote,
		};
	}

	// Vectorize
	for (const vectorize of vectorizeBindings) {
		warnOrError("vectorize", vectorize.remote);
		env[vectorize.binding] = {
			type: "vectorize",
			name: vectorize.index_name,
			remote: vectorize.remote,
		};
	}

	// VPC services / networks
	for (const vpc of vpcServices) {
		warnOrError("vpc_service", vpc.remote);
		env[vpc.binding] = {
			type: "vpc-service",
			id: vpc.service_id,
			remote: vpc.remote,
		};
	}
	for (const vpc of vpcNetworks) {
		warnOrError("vpc_network", vpc.remote);
		env[vpc.binding] = {
			type: "vpc-network",
			...(vpc.tunnel_id !== undefined
				? { tunnelId: vpc.tunnel_id }
				: { networkId: vpc.network_id as string }),
			remote: vpc.remote,
		};
	}

	// Secrets Store
	for (const secret of secretsStoreSecrets) {
		env[secret.binding] = {
			type: "secrets-store-secret",
			storeId: secret.store_id,
			secretName: secret.secret_name,
		};
	}

	// hello-world (internal example/test plugin)
	for (const helloWorld of helloWorldBindings) {
		env[helloWorld.binding] = {
			type: "hello-world",
			enable_timer: helloWorld.enable_timer,
		};
	}

	// Flagship
	for (const flagship of flagshipBindings) {
		warnOrError("flagship", flagship.remote);
		env[flagship.binding] = {
			type: "flagship",
			id: getRemoteId(flagship.app_id) ?? flagship.binding,
			remote: flagship.remote,
		};
	}

	// Artifacts
	for (const artifact of artifactsBindings) {
		warnOrError("artifacts", artifact.remote);
		env[artifact.binding] = {
			type: "artifacts",
			namespace: artifact.namespace,
			remote: artifact.remote,
		};
	}

	// Worker Loaders
	for (const workerLoader of workerLoaders) {
		env[workerLoader.binding] = { type: "worker-loader" };
	}

	// Send email. The flat binding is a union over the three mutually-exclusive
	// address configs, which TS can't narrow through, so read via a flat view.
	for (const email of sendEmailBindings) {
		const emailConfig = email as {
			destination_address?: string;
			allowed_destination_addresses?: string[];
			allowed_sender_addresses?: string[];
		};
		const emailBinding: Extract<MiniflareBinding, { type: "send-email" }> = {
			type: "send-email",
			remote: email.remote,
		};
		if (emailConfig.destination_address !== undefined) {
			emailBinding.destinationAddress = emailConfig.destination_address;
		}
		if (emailConfig.allowed_destination_addresses !== undefined) {
			emailBinding.allowedDestinationAddresses =
				emailConfig.allowed_destination_addresses;
		}
		if (emailConfig.allowed_sender_addresses !== undefined) {
			emailBinding.allowedSenderAddresses =
				emailConfig.allowed_sender_addresses;
		}
		env[email.name] = emailBinding;
	}

	// Rate limiting (regular + unsafe). Miniflare keys counters by `namespace`;
	// freeform unsafe bindings may lack a namespace_id, so fall back to the
	// binding name to preserve per-binding isolation.
	for (const ratelimit of ratelimits) {
		env[ratelimit.name] = {
			type: "rate-limit",
			namespace: ratelimit.namespace_id ?? ratelimit.name,
			simple: ratelimit.simple,
		};
	}

	// AI family (singletons where noted)
	for (const ai of aiBindings) {
		warnOrError("ai", ai.remote);
		env[ai.binding] = { type: "ai", remote: ai.remote };
	}
	for (const ns of aiSearchNamespaceBindings) {
		warnOrError("ai_search_namespace", ns.remote);
		env[ns.binding] = {
			type: "ai-search-namespace",
			namespace: ns.namespace as string,
			remote: ns.remote,
		};
	}
	for (const inst of aiSearchInstanceBindings) {
		warnOrError("ai_search", inst.remote);
		env[inst.binding] = {
			type: "ai-search",
			name: inst.instance_name,
			remote: inst.remote,
		};
	}
	for (const ws of websearchBindings) {
		warnOrError("websearch", ws.remote);
		env[ws.binding] = { type: "web-search", remote: ws.remote };
	}
	for (const memory of agentMemoryBindings) {
		warnOrError("agent_memory", memory.remote);
		env[memory.binding] = {
			type: "agent-memory",
			namespace: memory.namespace as string,
			remote: memory.remote,
		};
	}

	// Images / media / browser / stream / version-metadata
	for (const images of imagesBindings) {
		env[images.binding] = { type: "images", remote: images.remote };
	}
	for (const media of mediaBindings) {
		warnOrError("media", media.remote);
		env[media.binding] = { type: "media", remote: media.remote };
	}
	for (const browser of browserBindings) {
		env[browser.binding] = { type: "browser", remote: browser.remote };
	}
	for (const stream of streamBindings) {
		env[stream.binding] = { type: "stream", remote: stream.remote };
	}
	for (const versionMetadata of versionMetadataBindings) {
		env[versionMetadata.binding] = { type: "version-metadata" };
	}

	// Function-backed service bindings. Wrangler's `ServiceFetch` uses undici's
	// `Request`/`Response`, which are structurally compatible with miniflare's
	// but nominally distinct, so bridge via the handler's declared type.
	for (const fetcher of fetchers) {
		env[fetcher.binding] = {
			type: "fetcher",
			handler: fetcher.fetcher as unknown as Extract<
				MiniflareBinding,
				{ type: "fetcher" }
			>["handler"],
		};
	}

	// Service (worker-to-worker) bindings. A `dev` plugin overrides the regular
	// service binding and routes it through Miniflare's external-plugin pathway.
	for (const service of services) {
		if (service.dev !== undefined) {
			const {
				binding: _binding,
				dev: { plugin, options: devOptions },
				remote: _remote,
				props: _props,
				type: _type,
				...options
			} = service;

			logger.debug(
				`Binding ${service.binding} is a local binding to plugin ${plugin.name} provided by package ${plugin.package}`
			);

			env[service.binding] = {
				type: "unsafe:service",
				dev: { plugin, options: { ...options, ...devOptions } },
			};
			continue;
		}

		env[service.binding] = {
			type: "worker",
			workerName: service.service,
			exportName: service.entrypoint,
			props: service.props,
			remote: service.remote,
		};
	}

	// Unsafe bindings with a local dev plugin (excluding hello-world, handled above)
	const unsafeBindingsWithLocalDev = Object.entries(bindings ?? {}).filter(
		(b) => isUnsafeServiceBindingWithDevCfg(b[1])
	);
	for (const [name, unsafeBinding] of unsafeBindingsWithLocalDev) {
		assert(isUnsafeServiceBindingWithDevCfg(unsafeBinding));
		const {
			type,
			dev: {
				plugin,
				options: /* additional options just for dev */ devOptions,
			},
			// additional options that are included in the production binding
			...options
		} = unsafeBinding;

		logger.debug(
			`Binding ${name} is a local binding to plugin ${plugin.name} provided by package ${plugin.package}`
		);

		env[name] = {
			type: `unsafe:${type.slice("unsafe_".length)}`,
			dev: { plugin, options: { ...options, ...devOptions } },
		};
	}

	// Durable Objects.
	//
	// `classNameToUseSQLite` is the complete set of DO classes this worker
	// provisions via migrations / declarative exports. Each becomes a
	// `config.exports` entry (the definition + storage backend). Bound DOs
	// additionally get a `config.env` entry pointing at the defining worker;
	// Miniflare reroutes cross-worker references automatically, so
	// self/in-instance references simply use this worker's own name.
	const classNameToUseSQLite = getDurableObjectClassNameToUseSQLiteMap(
		config.migrations,
		config.exports
	);
	const selfName = getName(config);

	for (const [className, useSQLite] of classNameToUseSQLite) {
		const container =
			config.containerDOClassNames?.size && config.enableContainers
				? getImageNameFromDOClassName({
						doClassName: className,
						containerDOClassNames: config.containerDOClassNames,
						containerBuildId: config.containerBuildId,
					})
				: undefined;
		exports[className] = {
			type: "durable-object",
			storage: useSQLite ? "sqlite" : "legacy-kv",
			...(container && { container }),
		};
	}

	for (const {
		name,
		class_name: className,
		script_name: scriptName,
	} of durableObjects) {
		env[name] = {
			type: "durable-object",
			workerName: scriptName ?? selfName,
			exportName: className,
		};
	}

	return {
		env,
		exports,
		wasmBindings,
		textBlobBindings,
		dataBlobBindings,
		externalWorkers: [],
	};
}

export function getDefaultProjectTmpPath(projectRoot: string): string {
	return path.join(getWranglerHiddenDirPath(projectRoot), "tmp");
}

export function getDefaultPersistRoot(
	localPersistencePath: ConfigBundle["localPersistencePath"]
): string | undefined {
	if (localPersistencePath !== false) {
		const v3Path = path.join(localPersistencePath, "v3");
		return v3Path;
	}
}

export function buildAssetOptions(config: Pick<ConfigBundle, "assets">) {
	if (config.assets) {
		const { directory, binding, assetConfig, routerConfig, run_worker_first } =
			config.assets;
		return {
			// The `env` binding entry that connects the user worker to the asset
			// worker. Undefined for assets-only workers with no binding.
			bindingName: binding,
			// The miniflare assets plugin rebuilds the router/asset config from
			// these flat fields; it also reads `_redirects`/`_headers` directly
			// from the asset directory, so we don't thread those through.
			assets: {
				directory,
				htmlHandling: assetConfig.html_handling,
				notFoundHandling: assetConfig.not_found_handling,
				runWorkerFirst: run_worker_first,
				hasUserWorker: routerConfig.has_user_worker,
			},
		};
	}
}

export function buildSitesOptions({
	legacyAssetPaths,
}: Pick<ConfigBundle, "legacyAssetPaths">) {
	if (legacyAssetPaths !== undefined) {
		const { baseDirectory, assetDirectory, includePatterns, excludePatterns } =
			legacyAssetPaths;
		return {
			sitePath: path.join(baseDirectory, assetDirectory),
			siteInclude: includePatterns.length > 0 ? includePatterns : undefined,
			siteExclude: excludePatterns.length > 0 ? excludePatterns : undefined,
		};
	}
}

export type Options = Extract<MiniflareOptions, { workers: WorkerOptions[] }>;

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

	const { manifest, serviceWorkerScript } = await buildSourceOptions(config);
	const { env, exports, wasmBindings, textBlobBindings, dataBlobBindings } =
		buildMiniflareBindingOptions(config);

	if (getBrowserRenderingHeadfulFromEnv()) {
		for (const binding of Object.values(env)) {
			if (binding.type === "browser") {
				(binding as { headful?: boolean }).headful = true;
			}
		}
	}

	const assetOptions = buildAssetOptions(config);
	if (assetOptions?.bindingName !== undefined) {
		env[assetOptions.bindingName] = { type: "assets" };
	}

	const sitesOptions = buildSitesOptions(config);
	const resourcePersistencePath = getDefaultPersistRoot(
		config.localPersistencePath
	);
	const resourceTmpPath = getDefaultProjectTmpPath(config.projectRoot);

	// Legacy config: service-worker script + module/blob bindings + Workers Sites.
	const legacy: LegacyConfig = { ...sitesOptions };
	if (serviceWorkerScript !== undefined) {
		legacy.serviceWorkerScript = serviceWorkerScript;
	}
	if (Object.keys(wasmBindings).length > 0) {
		legacy.wasmBindings = wasmBindings;
	}
	if (Object.keys(textBlobBindings).length > 0) {
		legacy.textBlobBindings = textBlobBindings;
	}
	if (Object.keys(dataBlobBindings).length > 0) {
		legacy.dataBlobBindings = dataBlobBindings;
	}

	// Triggers: routes become `fetch` triggers; queue consumers become `queue`
	// triggers (queue producers are `env` bindings).
	const triggers: MiniflareTrigger[] = [];
	for (const pattern of config.routes ?? []) {
		triggers.push({ type: "fetch", pattern });
	}
	for (const consumer of config.queueConsumers ?? []) {
		triggers.push({
			type: "queue",
			name: consumer.queue,
			deadLetterQueue: consumer.dead_letter_queue,
			maxBatchSize: consumer.max_batch_size,
			maxBatchTimeout: consumer.max_batch_timeout,
			maxRetries: consumer.max_retries,
			retryDelay: consumer.retry_delay,
		});
	}

	// Tail consumers (streaming and non-streaming) collapse into a single list.
	const tailConsumers: MiniflareTailConsumer[] = [];
	for (const tail of config.tails ?? []) {
		tailConsumers.push({ workerName: tail.service });
	}
	for (const tail of config.streamingTails ?? []) {
		tailConsumers.push({ workerName: tail.service, streaming: true });
	}

	// Dev-only config: remote proxying, outbound fetch interception, zone.
	const dev: DevConfig = {};
	if (remoteProxyConnectionString !== undefined) {
		dev.remoteProxyConnectionString = remoteProxyConnectionString;
	}
	if (config.outboundService !== undefined) {
		dev.outboundService = {
			type: "fetcher",
			handler: config.outboundService as unknown as Extract<
				MiniflareBinding,
				{ type: "fetcher" }
			>["handler"],
		};
	}
	if (config.zone !== undefined) {
		dev.zone = config.zone;
	}

	const workerConfig: MiniflareWorkerConfig = {
		type: "worker",
		name: getName(config),
		// `getDevCompatibilityDate` always resolves a date (falling back to
		// today's), so this nullish branch is effectively unreachable; it exists
		// only to satisfy the now-required `compatibilityDate` field.
		compatibilityDate:
			config.compatibilityDate ?? new Date().toISOString().substring(0, 10),
		compatibilityFlags: config.compatibilityFlags,
		env,
		exports,
	};
	if (manifest !== undefined) {
		workerConfig.manifest = manifest;
	}
	if (assetOptions !== undefined) {
		workerConfig.assets = assetOptions.assets;
	}
	if (triggers.length > 0) {
		workerConfig.triggers = triggers;
	}
	if (tailConsumers.length > 0) {
		workerConfig.tailConsumers = tailConsumers;
	}

	const worker: WorkerOptions = { config: workerConfig };
	if (Object.keys(legacy).length > 0) {
		worker.legacy = legacy;
	}
	if (Object.keys(dev).length > 0) {
		worker.dev = dev;
	}

	const options: MiniflareOptions = {
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
		workers: [worker],
	};
	return options;
}

/**
 * Returns the Container options for the DO class name.
 * @returns The configuration or `undefined` when the DO has no attached container
 */
export function getImageNameFromDOClassName(options: {
	doClassName: string;
	containerDOClassNames: Set<string>;
	containerBuildId: string | undefined;
}): DOContainerOptions | undefined {
	assert(
		options.containerBuildId,
		"Build ID should be set if containers are defined and enabled"
	);

	if (options.containerDOClassNames.has(options.doClassName)) {
		return {
			imageName: getDevContainerImageName(
				options.doClassName,
				options.containerBuildId
			),
		};
	}
}

/**
 * isUnsafeServiceBindingWithDevCfg is a typeguard that checks whether the user has specified unsafe
 * service bindings with a local development configuration in their Worker options
 */
export function isUnsafeServiceBindingWithDevCfg(
	b: Binding
): b is Required<
	Exclude<
		Extract<Binding, { type: `unsafe_${string}` }>,
		{ type: "unsafe_hello_world" }
	>
> {
	return isUnsafeBindingType(b.type) && "dev" in b;
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
