import assert from "node:assert";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDevContainerImageName } from "@cloudflare/containers-shared";
import { CoreHeaders, HttpOptions_Style, Log, LogLevel } from "miniflare";
import {
	EXTERNAL_AI_WORKER_NAME,
	EXTERNAL_AI_WORKER_SCRIPT,
	getAIFetcher,
} from "../ai/fetcher";
import { ModuleTypeToRuleType } from "../deployment-bundle/module-collection";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { UserError } from "../errors";
import {
	EXTERNAL_IMAGES_WORKER_NAME,
	EXTERNAL_IMAGES_WORKER_SCRIPT,
	getImagesRemoteFetcher,
} from "../images/fetcher";
import { logger } from "../logger";
import { getSourceMappedString } from "../sourcemap";
import { updateCheck } from "../update-check";
import { warnOrError } from "../utils/print-bindings";
import {
	EXTERNAL_VECTORIZE_WORKER_NAME,
	EXTERNAL_VECTORIZE_WORKER_SCRIPT,
	MakeVectorizeFetcher,
} from "../vectorize/fetcher";
import { getClassNamesWhichUseSQLite } from "./class-names-sqlite";
import type { ServiceFetch } from "../api";
import type { AssetsOptions } from "../assets";
import type { Config } from "../config";
import type { ContainerEngine } from "../config/environment";
import type {
	CfD1Database,
	CfDispatchNamespace,
	CfDurableObject,
	CfHyperdrive,
	CfKvNamespace,
	CfPipeline,
	CfQueue,
	CfR2Bucket,
	CfScriptFormat,
	CfUnsafeBinding,
	CfWorkerInit,
	CfWorkflow,
} from "../deployment-bundle/worker";
import type { WorkerRegistry } from "../dev-registry";
import type { LoggerLevel } from "../logger";
import type { LegacyAssetPaths } from "../sites";
import type { EsbuildBundle } from "./use-esbuild";
import type {
	DOContainerOptions,
	MiniflareOptions,
	RemoteProxyConnectionString,
	SourceOptions,
	WorkerOptions,
} from "miniflare";
import type { UUID } from "node:crypto";
import type { Readable } from "node:stream";

// This worker proxies all external Durable Objects to the Wrangler session
// where they're defined, and receives all requests from other Wrangler sessions
// for this session's Durable Objects. Note the original request URL may contain
// non-standard protocols, so we store it in a header to restore later.
// It also provides stub classes for services that couldn't be found, for
// improved error messages when trying to call RPC methods.
const EXTERNAL_SERVICE_WORKER_NAME =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";
const EXTERNAL_SERVICE_WORKER_SCRIPT = `
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";

const HEADER_URL = "X-Miniflare-Durable-Object-URL";
const HEADER_NAME = "X-Miniflare-Durable-Object-Name";
const HEADER_ID = "X-Miniflare-Durable-Object-Id";
const HEADER_CF_BLOB = "X-Miniflare-Durable-Object-Cf-Blob";

const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
	"scheduled",
	"self",
	"tail",
	"tailStream",
	"test",
	"trace",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
]);

function createProxyPrototypeClass(handlerSuperKlass, getUnknownPrototypeKey) {
	// Build a class with a "Proxy"-prototype, so we can intercept RPC calls and
	// throw unsupported exceptions :see_no_evil:
	function klass(ctx, env) {
		// Delay proxying prototype until construction, so workerd sees this as a
		// regular class when introspecting it. This check fails if we don't do this:
		// https://github.com/cloudflare/workerd/blob/9e915ed637d65adb3c57522607d2cd8b8d692b6b/src/workerd/io/worker.c%2B%2B#L1920-L1921
		klass.prototype = new Proxy(klass.prototype, {
			get(target, key, receiver) {
				const value = Reflect.get(target, key, receiver);
				if (value !== undefined) return value;
				if (HANDLER_RESERVED_KEYS.has(key)) return;
				return getUnknownPrototypeKey(key);
			}
		});

		return Reflect.construct(handlerSuperKlass, [ctx, env], klass);
	}

	Reflect.setPrototypeOf(klass.prototype, handlerSuperKlass.prototype);
	Reflect.setPrototypeOf(klass, handlerSuperKlass);

	return klass;
}

function createDurableObjectClass({ className, proxyUrl }) {
	const klass = createProxyPrototypeClass(DurableObject, (key) => {
		throw new Error(\`Cannot access \\\`\${className}#\${key}\\\` as Durable Object RPC is not yet supported between multiple \\\`wrangler dev\\\` sessions.\`);
	});

	// Forward regular HTTP requests to the other "wrangler dev" session
	klass.prototype.fetch = function(request) {
		if (proxyUrl === undefined) {
			return new Response(\`\${className} \${proxyUrl}[wrangler] Couldn't find \\\`wrangler dev\\\` session for class "\${className}" to proxy to\`, { status: 503 });
		}
		const proxyRequest = new Request(proxyUrl, request);
		proxyRequest.headers.set(HEADER_URL, request.url);
		proxyRequest.headers.set(HEADER_NAME, className);
		proxyRequest.headers.set(HEADER_ID, this.ctx.id.toString());
		proxyRequest.headers.set(HEADER_CF_BLOB, JSON.stringify(request.cf ?? {}));
		return fetch(proxyRequest);
	};

	return klass;
}

function createNotFoundWorkerEntrypointClass({ service }) {
	const klass = createProxyPrototypeClass(WorkerEntrypoint, (key) => {
		throw new Error(\`Cannot access \\\`\${key}\\\` as we couldn't find a \\\`wrangler dev\\\` session for service "\${service}" to proxy to.\`);
	});

	// Return regular HTTP response for HTTP requests
	klass.prototype.fetch = function(request) {
		const message = \`[wrangler] Couldn't find \\\`wrangler dev\\\` session for service "\${service}" to proxy to\`;
		return new Response(message, { status: 503 });
	};

	return klass;
}

export default {
	async fetch(request, env) {
		const originalUrl = request.headers.get(HEADER_URL);
		const className = request.headers.get(HEADER_NAME);
		const idString = request.headers.get(HEADER_ID);
		const cf = JSON.parse(request.headers.get(HEADER_CF_BLOB));
		if (originalUrl === null || className === null || idString === null) {
			return new Response("[wrangler] Received Durable Object proxy request with missing headers", { status: 400 });
		}
		request = new Request(originalUrl, request);
		request.headers.delete(HEADER_URL);
		request.headers.delete(HEADER_NAME);
		request.headers.delete(HEADER_ID);
		request.headers.delete(HEADER_CF_BLOB);
		const ns = env[className];
		const id = ns.idFromString(idString);
		const stub = ns.get(id);
		return stub.fetch(request, { cf });
	}
}
`;

type SpecificPort = Exclude<number, 0>;
type RandomConsistentPort = 0; // random port, but consistent across reloads
type RandomDifferentPort = undefined; // random port, but different across reloads
type Port = SpecificPort | RandomConsistentPort | RandomDifferentPort;

export interface ConfigBundle {
	// TODO(soon): maybe rename some of these options, check proposed API Google Docs
	name: string | undefined;
	bundle: EsbuildBundle;
	format: CfScriptFormat | undefined;
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	complianceRegion: Config["compliance_region"] | undefined;
	bindings: CfWorkerInit["bindings"];
	migrations: Config["migrations"] | undefined;
	workerDefinitions: WorkerRegistry | undefined | null;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	assets: AssetsOptions | undefined;
	initialPort: Port;
	initialIp: string;
	rules: Config["rules"];
	inspectorPort: number | undefined;
	localPersistencePath: string | null;
	liveReload: boolean;
	crons: Config["triggers"]["crons"];
	queueConsumers: Config["queues"]["consumers"];
	localProtocol: "http" | "https";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	localUpstream: string | undefined;
	upstreamProtocol: "http" | "https";
	inspect: boolean;
	services: Config["services"] | undefined;
	tails: Config["tail_consumers"] | undefined;
	serviceBindings: Record<string, ServiceFetch>;
	bindVectorizeToProd: boolean;
	imagesLocalMode: boolean;
	testScheduled: boolean;
	containerDOClassNames: Set<string> | undefined;
	containerBuildId: string | undefined;
	containerEngine: ContainerEngine | undefined;
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
			return void updateCheck().then((maybeNewVersion) => {
				if (maybeNewVersion === undefined) {
					return;
				}
				message += [
					"",
					"Features enabled by your requested compatibility date may not be available.",
					`Upgrade to \`wrangler@${maybeNewVersion}\` to remove this warning.`,
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

async function buildSourceOptions(
	config: Omit<ConfigBundle, "rules">
): Promise<{ sourceOptions: SourceOptions; entrypointNames: string[] }> {
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
		const sourceOptions: SourceOptions = {
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

function getRemoteId(id: string | symbol | undefined): string | null {
	return typeof id === "string" ? id : null;
}

function kvNamespaceEntry(
	{ binding, id: originalId, experimental_remote }: CfKvNamespace,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(originalId) ?? binding;
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function r2BucketEntry(
	{ binding, bucket_name, experimental_remote }: CfR2Bucket,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(bucket_name) ?? binding;
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function d1DatabaseEntry(
	{
		binding,
		database_id,
		preview_database_id,
		experimental_remote,
	}: CfD1Database,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{ id: string; remoteProxyConnectionString?: RemoteProxyConnectionString },
] {
	const id = getRemoteId(preview_database_id ?? database_id) ?? binding;
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { id }];
	}
	return [binding, { id, remoteProxyConnectionString }];
}
function queueProducerEntry(
	{
		binding,
		queue_name: queueName,
		delivery_delay: deliveryDelay,
		experimental_remote,
	}: CfQueue,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		queueName: string;
		deliveryDelay: number | undefined;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { queueName, deliveryDelay }];
	}

	return [binding, { queueName, deliveryDelay, remoteProxyConnectionString }];
}
function pipelineEntry(pipeline: CfPipeline): [string, string] {
	return [pipeline.binding, pipeline.pipeline];
}
function hyperdriveEntry(hyperdrive: CfHyperdrive): [string, string] {
	return [hyperdrive.binding, hyperdrive.localConnectionString ?? ""];
}
function workflowEntry(
	{
		binding,
		name,
		class_name: className,
		script_name: scriptName,
		experimental_remote,
	}: CfWorkflow,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		name: string;
		className: string;
		scriptName?: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [
			binding,
			{
				name,
				className,
				scriptName,
			},
		];
	}

	return [
		binding,
		{
			name,
			className,
			scriptName,
			remoteProxyConnectionString,
		},
	];
}
function dispatchNamespaceEntry({
	binding,
	namespace,
	experimental_remote,
}: CfDispatchNamespace): [string, { namespace: string }];
function dispatchNamespaceEntry(
	{ binding, namespace, experimental_remote }: CfDispatchNamespace,
	remoteProxyConnectionString: RemoteProxyConnectionString
): [
	string,
	{
		namespace: string;
		remoteProxyConnectionString: RemoteProxyConnectionString;
	},
];
function dispatchNamespaceEntry(
	{ binding, namespace, experimental_remote }: CfDispatchNamespace,
	remoteProxyConnectionString?: RemoteProxyConnectionString
): [
	string,
	{
		namespace: string;
		remoteProxyConnectionString?: RemoteProxyConnectionString;
	},
] {
	if (!remoteProxyConnectionString || !experimental_remote) {
		return [binding, { namespace }];
	}
	return [binding, { namespace, remoteProxyConnectionString }];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ratelimitEntry(ratelimit: CfUnsafeBinding): [string, any] {
	return [ratelimit.name, ratelimit];
}
type QueueConsumer = NonNullable<Config["queues"]["consumers"]>[number];
function queueConsumerEntry(consumer: QueueConsumer) {
	const options = {
		maxBatchSize: consumer.max_batch_size,
		maxBatchTimeout: consumer.max_batch_timeout,
		maxRetries: consumer.max_retries,
		deadLetterQueue: consumer.dead_letter_queue,
		retryDelay: consumer.retry_delay,
	};
	return [consumer.queue, options] as const;
}

type WorkerOptionsBindings = Pick<
	WorkerOptions,
	| "bindings"
	| "ai"
	| "textBlobBindings"
	| "dataBlobBindings"
	| "wasmBindings"
	| "kvNamespaces"
	| "r2Buckets"
	| "d1Databases"
	| "queueProducers"
	| "queueConsumers"
	| "pipelines"
	| "hyperdrives"
	| "durableObjects"
	| "serviceBindings"
	| "ratelimits"
	| "workflows"
	| "wrappedBindings"
	| "secretsStoreSecrets"
	| "images"
	| "email"
	| "analyticsEngineDatasets"
	| "tails"
	| "browserRendering"
	| "vectorize"
	| "dispatchNamespaces"
	| "mtlsCertificates"
	| "helloWorld"
>;

type MiniflareBindingsConfig = Pick<
	ConfigBundle,
	| "bindings"
	| "migrations"
	| "workerDefinitions"
	| "queueConsumers"
	| "name"
	| "services"
	| "serviceBindings"
	| "imagesLocalMode"
	| "tails"
	| "complianceRegion"
	| "containerDOClassNames"
	| "containerBuildId"
> &
	Partial<Pick<ConfigBundle, "format" | "bundle" | "assets">>;

// TODO(someday): would be nice to type these methods more, can we export types for
//  each plugin options schema and use those
export function buildMiniflareBindingOptions(
	config: MiniflareBindingsConfig,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	remoteBindingsEnabled: boolean
): {
	bindingOptions: WorkerOptionsBindings;
	internalObjects: CfDurableObject[];
	externalWorkers: WorkerOptions[];
} {
	const bindings = config.bindings;

	// Setup blob and module bindings
	// TODO: check all these blob bindings just work, they're relative to cwd
	const textBlobBindings = { ...bindings.text_blobs };
	const dataBlobBindings = { ...bindings.data_blobs };
	const wasmBindings = { ...bindings.wasm_modules };
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

	// Setup service bindings to external services
	const serviceBindings: NonNullable<WorkerOptions["serviceBindings"]> = {
		...config.serviceBindings,
	};

	const notFoundServices = new Set<string>();
	for (const service of config.services ?? []) {
		if (remoteProxyConnectionString && service.experimental_remote) {
			serviceBindings[service.binding] = {
				name: service.service,
				props: service.props,
				entrypoint: service.entrypoint,
				remoteProxyConnectionString,
			};
			continue;
		}

		if (service.service === config.name || config.workerDefinitions === null) {
			// If this is a service binding to the current worker or the registry is disabled,
			// don't bother using the dev registry to look up the address, just bind to it directly.
			serviceBindings[service.binding] = {
				name: service.service,
				entrypoint: service.entrypoint,
				props: service.props,
			};
			continue;
		}

		const target = config.workerDefinitions?.[service.service];

		if (target?.host === undefined || target.port === undefined) {
			// If the target isn't in the registry, always return an error response
			notFoundServices.add(service.service);
			serviceBindings[service.binding] = {
				name: EXTERNAL_SERVICE_WORKER_NAME,
				entrypoint: getIdentifier(`service_${service.service}`),
			};
		} else {
			// Otherwise, try to build an `external` service to it. `external`
			// services support JSRPC over HTTP CONNECT using a special hostname.
			// Refer to https://github.com/cloudflare/workerd/pull/1757 for details.
			let address: `${string}:${number}`;
			let style: HttpOptions_Style = HttpOptions_Style.PROXY;
			if (service.entrypoint !== undefined) {
				// If the user has requested a named entrypoint...
				if (target.entrypointAddresses === undefined) {
					// ...but the "server" `wrangler` hasn't provided any because it's too
					// old, throw.
					throw new UserError(
						`The \`wrangler dev\` session for service "${service.service}" does not support proxying entrypoints. Please upgrade "${service.service}"'s \`wrangler\` version.`
					);
				}
				const entrypointAddress =
					target.entrypointAddresses[service.entrypoint];
				if (entrypointAddress === undefined) {
					// ...but the named entrypoint doesn't exist, throw
					throw new UserError(
						`The \`wrangler dev\` session for service "${service.service}" does not export an entrypoint named "${service.entrypoint}"`
					);
				}
				address = `${entrypointAddress.host}:${entrypointAddress.port}`;
			} else {
				// Otherwise, if the user hasn't specified a named entrypoint, assume
				// they meant to bind to the `default` entrypoint.
				const defaultEntrypointAddress =
					target.entrypointAddresses?.["default"];
				if (defaultEntrypointAddress === undefined) {
					// If the "server" `wrangler` is too old to provide direct entrypoint
					// addresses (or uses service-worker syntax), fallback to sending requests directly to the target...
					if (target.protocol === "https") {
						// ...unless the target is listening on HTTPS, in which case throw.
						// We can't support this as `workerd` requires us to explicitly
						// configure allowed self-signed certificates. These aren't stored
						// in the registry. There's no blanket `rejectUnauthorized: false`
						// option like in Node.
						throw new UserError(
							`Cannot proxy to \`wrangler dev\` session for service "${service.service}" because it uses HTTPS. Please upgrade "${service.service}"'s \`wrangler\` version, or remove the \`--local-protocol\`/\`dev.local_protocol\` option.`
						);
					}
					address = `${target.host}:${target.port}`;
					// Removing this line causes `Internal Service Error` responses from service-worker syntax workers, since they don't seem to support the PROXY protocol
					style = HttpOptions_Style.HOST;
				} else {
					address = `${defaultEntrypointAddress.host}:${defaultEntrypointAddress.port}`;
				}
			}

			// BUG: We have no way to pass `props` across an external socket, so we
			// drop them. We are planning to move away from the multi-process model
			// anyway, which will solve the problem.
			serviceBindings[service.binding] = {
				external: {
					address,
					http: {
						style,
						cfBlobHeader: CoreHeaders.CF_BLOB,
					},
				},
			};
		}
	}

	const tails: NonNullable<WorkerOptions["tails"]> = [];
	const notFoundTails = new Set<string>();
	for (const tail of config.tails ?? []) {
		if (tail.service === config.name || config.workerDefinitions === null) {
			// If this is a tail binding to the current Worker or the registry is disabled,
			// don't bother using the dev registry to look up the address, just bind to it directly.
			tails.push({ name: tail.service });

			continue;
		}

		const target = config.workerDefinitions?.[tail.service];

		// Tail consumers are always on the default entrypoint
		const defaultEntrypoint = target?.entrypointAddresses?.["default"];
		if (
			target?.host === undefined ||
			target.port === undefined ||
			defaultEntrypoint === undefined
		) {
			notFoundTails.add(tail.service);
		} else {
			const style = HttpOptions_Style.PROXY;
			const address = `${defaultEntrypoint.host}:${defaultEntrypoint.port}`;

			tails.push({
				external: {
					address,
					http: {
						style,
						cfBlobHeader: CoreHeaders.CF_BLOB,
					},
				},
			});
		}
	}

	if (notFoundTails.size > 0) {
		logger.debug(
			"Couldn't connect to the following configured `tail_consumers`: ",
			[...notFoundTails.values()].join(", ")
		);
	}

	const classNameToUseSQLite = getClassNamesWhichUseSQLite(config.migrations);

	// Partition Durable Objects based on whether they're internal (defined by
	// this session's worker), or external (defined by another session's worker
	// registered in the dev registry)
	const internalObjects: CfDurableObject[] = [];
	const externalObjects: CfDurableObject[] = [];
	for (const binding of bindings.durable_objects?.bindings ?? []) {
		const isInternal =
			binding.script_name === undefined || binding.script_name === config.name;
		if (isInternal) {
			internalObjects.push(binding);
		} else {
			externalObjects.push(binding);
		}
	}

	// Partition workflow bindings based on whether they're internal (defined by
	// this session's worker), or external (defined by another session's worker
	// registered in the dev registry)
	const internalWorkflows: CfWorkflow[] = [];
	const externalWorkflows: CfWorkflow[] = [];
	for (const binding of bindings.workflows ?? []) {
		const isInternal =
			binding.script_name === undefined || binding.script_name === config.name;
		if (isInternal) {
			internalWorkflows.push(binding);
		} else {
			externalWorkflows.push(binding);
		}
	}

	const externalWorkers: WorkerOptions[] = [];
	if (config.workerDefinitions !== null) {
		// Setup Durable Object bindings and proxy worker
		externalWorkers.push({
			name: EXTERNAL_SERVICE_WORKER_NAME,
			// Bind all internal objects, so they're accessible by all other sessions
			// that proxy requests for our objects to this worker
			durableObjects: Object.fromEntries(
				internalObjects.map(({ class_name: className }) => {
					return [
						className,
						{
							className,
							scriptName: getName(config),
							useSQLite: classNameToUseSQLite.get(className),
						},
					];
				})
			),
			// Use this worker instead of the user worker if the pathname is
			// `/${EXTERNAL_SERVICE_WORKER_NAME}`
			routes: [`*/${EXTERNAL_SERVICE_WORKER_NAME}`],
			// Use in-memory storage for the stub object classes *declared* by this
			// script. They don't need to persist anything, and would end up using the
			// incorrect unsafe unique key.
			unsafeEphemeralDurableObjects: true,
			compatibilityDate: "2024-01-01",
			modules: true,
			script:
				EXTERNAL_SERVICE_WORKER_SCRIPT +
				// Add stub object classes that proxy requests to the correct session
				externalObjects
					.map(({ class_name, script_name }) => {
						assert(script_name !== undefined);
						const target = config.workerDefinitions?.[script_name];
						const targetHasClass = target?.durableObjects.some(
							({ className }) => className === class_name
						);

						const identifier = getIdentifier(`do_${script_name}_${class_name}`);
						const classNameJson = JSON.stringify(class_name);

						if (
							target?.host === undefined ||
							target.port === undefined ||
							!targetHasClass
						) {
							// If we couldn't find the target or the class, create a stub object
							// that just returns `503 Service Unavailable` responses.
							return `export const ${identifier} = createDurableObjectClass({ className: ${classNameJson} });`;
						} else if (target.protocol === "https") {
							throw new UserError(
								`Cannot proxy to \`wrangler dev\` session for class ${classNameJson} because it uses HTTPS. Please remove the \`--local-protocol\`/\`dev.local_protocol\` option.`
							);
						} else {
							// Otherwise, create a stub object that proxies request to the
							// target session at `${hostname}:${port}`.
							const proxyUrl = `http://${target.host}:${target.port}/${EXTERNAL_SERVICE_WORKER_NAME}`;
							const proxyUrlJson = JSON.stringify(proxyUrl);
							return `export const ${identifier} = createDurableObjectClass({ className: ${classNameJson}, proxyUrl: ${proxyUrlJson} });`;
						}
					})
					.join("\n") +
				Array.from(notFoundServices)
					.map((service) => {
						const identifier = getIdentifier(`service_${service}`);
						const serviceJson = JSON.stringify(service);
						return `export const ${identifier} = createNotFoundWorkerEntrypointClass({ service: ${serviceJson} });`;
					})
					.join("\n"),
		});
	}

	const wrappedBindings: WorkerOptions["wrappedBindings"] = {};
	if (bindings.ai?.binding && !remoteBindingsEnabled) {
		externalWorkers.push({
			name: `${EXTERNAL_AI_WORKER_NAME}:${config.name}`,
			modules: [
				{
					type: "ESModule",
					path: "index.mjs",
					contents: EXTERNAL_AI_WORKER_SCRIPT,
				},
			],
			serviceBindings: {
				FETCHER: getAIFetcher({
					compliance_region: config.complianceRegion,
				}),
			},
		});

		wrappedBindings[bindings.ai.binding] = {
			scriptName: `${EXTERNAL_AI_WORKER_NAME}:${config.name}`,
		};
	}

	if (bindings.ai && remoteBindingsEnabled) {
		warnOrError("ai", bindings.ai.experimental_remote, "always-remote");
	}

	if (bindings.browser && remoteBindingsEnabled) {
		warnOrError("browser", bindings.browser.experimental_remote, "remote");
	}

	if (bindings.mtls_certificates && remoteBindingsEnabled) {
		for (const mtls of bindings.mtls_certificates) {
			warnOrError(
				"mtls_certificates",
				mtls.experimental_remote,
				"always-remote"
			);
		}
	}

	// Uses the implementation in miniflare instead if the users enable local mode
	if (
		bindings.images?.binding &&
		!config.imagesLocalMode &&
		!remoteBindingsEnabled
	) {
		externalWorkers.push({
			name: `${EXTERNAL_IMAGES_WORKER_NAME}:${config.name}`,
			modules: [
				{
					type: "ESModule",
					path: "index.mjs",
					contents: EXTERNAL_IMAGES_WORKER_SCRIPT,
				},
			],
			serviceBindings: {
				FETCHER: getImagesRemoteFetcher({
					compliance_region: config.complianceRegion,
				}),
			},
		});

		wrappedBindings[bindings.images?.binding] = {
			scriptName: `${EXTERNAL_IMAGES_WORKER_NAME}:${config.name}`,
		};
	}

	if (bindings.vectorize && !remoteBindingsEnabled) {
		for (const vectorizeBinding of bindings.vectorize) {
			const bindingName = vectorizeBinding.binding;
			const indexName = vectorizeBinding.index_name;
			const indexVersion = "v2";

			externalWorkers.push({
				name: `${EXTERNAL_VECTORIZE_WORKER_NAME}:${config.name}:${bindingName}`,
				modules: [
					{
						type: "ESModule",
						path: "index.mjs",
						contents: EXTERNAL_VECTORIZE_WORKER_SCRIPT,
					},
				],
				serviceBindings: {
					FETCHER: MakeVectorizeFetcher(
						{ compliance_region: config.complianceRegion },
						indexName
					),
				},
				bindings: {
					INDEX_ID: indexName,
					INDEX_VERSION: indexVersion,
				},
			});

			wrappedBindings[bindingName] = {
				scriptName: `${EXTERNAL_VECTORIZE_WORKER_NAME}:${config.name}:${bindingName}`,
			};
		}
	}

	const bindingOptions: WorkerOptionsBindings = {
		bindings: {
			...bindings.vars,
			// emulate version_metadata binding via a JSON var
			...(bindings.version_metadata
				? { [bindings.version_metadata.binding]: { id: randomUUID(), tag: "" } }
				: undefined),
		},
		textBlobBindings,
		dataBlobBindings,
		wasmBindings,

		ai:
			bindings.ai && remoteProxyConnectionString
				? {
						binding: bindings.ai.binding,
						remoteProxyConnectionString,
					}
				: undefined,

		kvNamespaces: Object.fromEntries(
			bindings.kv_namespaces?.map((kv) =>
				kvNamespaceEntry(kv, remoteProxyConnectionString)
			) ?? []
		),

		r2Buckets: Object.fromEntries(
			bindings.r2_buckets?.map((r2) =>
				r2BucketEntry(r2, remoteProxyConnectionString)
			) ?? []
		),
		d1Databases: Object.fromEntries(
			bindings.d1_databases?.map((d1) =>
				d1DatabaseEntry(d1, remoteProxyConnectionString)
			) ?? []
		),
		queueProducers: Object.fromEntries(
			bindings.queues?.map((queue) =>
				queueProducerEntry(queue, remoteProxyConnectionString)
			) ?? []
		),
		queueConsumers: Object.fromEntries(
			config.queueConsumers?.map(queueConsumerEntry) ?? []
		),
		pipelines: Object.fromEntries(bindings.pipelines?.map(pipelineEntry) ?? []),
		hyperdrives: Object.fromEntries(
			bindings.hyperdrive?.map(hyperdriveEntry) ?? []
		),
		analyticsEngineDatasets: Object.fromEntries(
			bindings.analytics_engine_datasets?.map((binding) => [
				binding.binding,
				{ dataset: binding.dataset ?? "dataset" },
			]) ?? []
		),
		workflows: Object.fromEntries([
			...internalWorkflows.map((workflow) => [
				workflow.binding,
				{
					name: workflow.name,
					className: workflow.class_name,
				},
			]),
			...externalWorkflows.map((workflow) =>
				workflowEntry(workflow, remoteProxyConnectionString)
			),
		]),
		secretsStoreSecrets: Object.fromEntries(
			bindings.secrets_store_secrets?.map((binding) => [
				binding.binding,
				binding,
			]) ?? []
		),
		helloWorld: Object.fromEntries(
			bindings.unsafe_hello_world?.map((binding) => [
				binding.binding,
				binding,
			]) ?? []
		),
		email: {
			send_email: bindings.send_email,
		},
		images:
			bindings.images && (config.imagesLocalMode || remoteBindingsEnabled)
				? {
						binding: bindings.images.binding,
						remoteProxyConnectionString:
							bindings.images.experimental_remote && remoteProxyConnectionString
								? remoteProxyConnectionString
								: undefined,
					}
				: undefined,
		browserRendering: bindings.browser?.binding
			? {
					binding: bindings.browser.binding,
					remoteProxyConnectionString:
						remoteBindingsEnabled &&
						remoteProxyConnectionString &&
						bindings.browser?.experimental_remote
							? remoteProxyConnectionString
							: undefined,
				}
			: undefined,

		vectorize:
			remoteBindingsEnabled && remoteProxyConnectionString
				? Object.fromEntries(
						bindings.vectorize
							?.filter((v) => {
								warnOrError("vectorize", v.experimental_remote, "remote");
								return v.experimental_remote;
							})
							.map((vectorize) => {
								return [
									vectorize.binding,
									{
										index_name: vectorize.index_name,
										remoteProxyConnectionString,
									},
								];
							}) ?? []
					)
				: undefined,

		dispatchNamespaces:
			remoteBindingsEnabled && remoteProxyConnectionString
				? Object.fromEntries(
						bindings.dispatch_namespaces
							?.filter((d) => {
								warnOrError(
									"dispatch_namespaces",
									d.experimental_remote,
									"remote"
								);
								return d.experimental_remote;
							})
							.map((dispatchNamespace) =>
								dispatchNamespaceEntry(
									dispatchNamespace,
									remoteProxyConnectionString
								)
							) ?? []
					)
				: undefined,

		durableObjects: Object.fromEntries([
			...internalObjects.map(({ name, class_name: className }) => {
				return [
					name,
					{
						className,
						useSQLite: classNameToUseSQLite.get(className),
						container: getImageNameFromDOClassName({
							doClassName: className,
							containerDOClassNames: config.containerDOClassNames,
							containerBuildId: config.containerBuildId,
						}),
					},
				];
			}),
			...externalObjects.map(
				({ name, class_name: className, script_name: scriptName }) => {
					const identifier = getIdentifier(`do_${scriptName}_${className}`);
					const useSQLite = classNameToUseSQLite.get(className);
					return config.workerDefinitions === null
						? [
								name,
								{
									className,
									scriptName,
								},
							]
						: [
								name,
								{
									className: identifier,
									scriptName: EXTERNAL_SERVICE_WORKER_NAME,
									useSQLite,
									// Matches the unique key Miniflare will generate for this object in
									// the target session. We need to do this so workerd generates the
									// same IDs it would if this were part of the same process. workerd
									// doesn't allow IDs from Durable Objects with different unique keys
									// to be used with each other.
									unsafeUniqueKey: `${scriptName}-${className}`,
								},
							];
				}
			),
		]),

		ratelimits: Object.fromEntries(
			bindings.unsafe?.bindings
				?.filter((b) => b.type == "ratelimit")
				.map(ratelimitEntry) ?? []
		),

		mtlsCertificates:
			remoteBindingsEnabled && remoteProxyConnectionString
				? Object.fromEntries(
						bindings.mtls_certificates
							?.filter((d) => {
								warnOrError(
									"mtls_certificates",
									d.experimental_remote,
									"remote"
								);
								return d.experimental_remote;
							})
							.map((mtlsCertificate) => [
								mtlsCertificate.binding,
								{
									remoteProxyConnectionString,
									certificate_id: mtlsCertificate.certificate_id,
								},
							]) ?? []
					)
				: undefined,

		serviceBindings,
		wrappedBindings: wrappedBindings,
		tails,
	};

	return {
		bindingOptions,
		internalObjects,
		externalWorkers,
	};
}

export function getDefaultPersistRoot(
	localPersistencePath: ConfigBundle["localPersistencePath"]
): string | undefined {
	if (localPersistencePath !== null) {
		const v3Path = path.join(localPersistencePath, "v3");
		return v3Path;
	}
}

export function buildAssetOptions(config: Pick<ConfigBundle, "assets">) {
	if (config.assets) {
		return {
			assets: {
				directory: config.assets.directory,
				binding: config.assets.binding,
				routerConfig: config.assets.routerConfig,
				assetConfig: config.assets.assetConfig,
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

export function handleRuntimeStdio(stdout: Readable, stderr: Readable) {
	// ASSUMPTION: each chunk is a whole message from workerd
	// This may not hold across OSes/architectures, but it seems to work on macOS M-line
	// I'm going with this simple approach to avoid complicating this too early
	// We can iterate on this heuristic in the future if it causes issues
	const classifiers = {
		// Is this chunk a big chonky barf from workerd that we want to hijack to cleanup/ignore?
		isBarf(chunk: string) {
			const containsLlvmSymbolizerWarning = chunk.includes(
				"Not symbolizing stack traces because $LLVM_SYMBOLIZER is not set"
			);
			const containsRecursiveIsolateLockWarning = chunk.includes(
				"took recursive isolate lock"
			);
			// Matches stack traces from workerd
			//  - on unix: groups of 9 hex digits separated by spaces
			//  - on windows: groups of 12 hex digits, or a single digit 0, separated by spaces
			const containsHexStack = /stack:( (0|[a-f\d]{4,})){3,}/.test(chunk);

			return (
				containsLlvmSymbolizerWarning ||
				containsRecursiveIsolateLockWarning ||
				containsHexStack
			);
		},
		// Is this chunk an Address In Use error?
		isAddressInUse(chunk: string) {
			return chunk.includes("Address already in use; toString() = ");
		},
		isWarning(chunk: string) {
			return /\.c\+\+:\d+: warning:/.test(chunk);
		},
		isCodeMovedWarning(chunk: string) {
			return /CODE_MOVED for unknown code block/.test(chunk);
		},
		isAccessViolation(chunk: string) {
			return chunk.includes("access violation;");
		},
	};

	stdout.on("data", (chunk: Buffer | string) => {
		chunk = chunk.toString().trim();

		if (classifiers.isBarf(chunk)) {
			// this is a big chonky barf from workerd that we want to hijack to cleanup/ignore

			// CLEANABLE:
			// there are no known cases to cleanup yet
			// but, as they are identified, we will do that here

			// IGNORABLE:
			// anything else not handled above is considered ignorable
			// so send it to the debug logs which are discarded unless
			// the user explicitly sets a logLevel indicating they care
			logger.debug(chunk);
		}

		// known case: warnings are not info, log them as such
		else if (classifiers.isWarning(chunk)) {
			logger.warn(chunk);
		}

		// anything not explicitly handled above should be logged as info (via stdout)
		else {
			logger.info(getSourceMappedString(chunk));
		}
	});

	stderr.on("data", (chunk: Buffer | string) => {
		chunk = chunk.toString().trim();

		if (classifiers.isBarf(chunk)) {
			// this is a big chonky barf from workerd that we want to hijack to cleanup/ignore

			// CLEANABLE:
			// known case to cleanup: Address in use errors
			if (classifiers.isAddressInUse(chunk)) {
				const address = chunk.match(
					/Address already in use; toString\(\) = (.+)\n/
				)?.[1];

				logger.error(
					`Address already in use (${address}). Please check that you are not already running a server on this address or specify a different port with --port.`
				);

				// Log the original error to the debug logs.
				logger.debug(chunk);
			}
			// In the past we have seen Access Violation errors on Windows, which may be caused by an outdated
			// version of the Windows OS or the Microsoft Visual C++ Redistributable.
			// See https://github.com/cloudflare/workers-sdk/issues/6170#issuecomment-2245209918
			else if (classifiers.isAccessViolation(chunk)) {
				let error = "There was an access violation in the runtime.";
				if (process.platform === "win32") {
					error +=
						"\nOn Windows, this may be caused by an outdated Microsoft Visual C++ Redistributable library.\n" +
						"Check that you have the latest version installed.\n" +
						"See https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist.";
				}
				logger.error(error);

				// Log the original error to the debug logs.
				logger.debug(chunk);
			}

			// IGNORABLE:
			// anything else not handled above is considered ignorable
			// so send it to the debug logs which are discarded unless
			// the user explicitly sets a logLevel indicating they care
			else {
				logger.debug(chunk);
			}
		}

		// known case: warnings are not errors, log them as such
		else if (classifiers.isWarning(chunk)) {
			logger.warn(chunk);
		}

		// known case: "error: CODE_MOVED for unknown code block?", warning for workerd devs, not application devs
		else if (classifiers.isCodeMovedWarning(chunk)) {
			// ignore entirely, don't even send it to the debug log file
		}

		// anything not explicitly handled above should be logged as an error (via stderr)
		else {
			logger.error(getSourceMappedString(chunk));
		}
	});
}

let didWarnMiniflareCronSupport = false;
let didWarnMiniflareVectorizeSupport = false;
let didWarnAiAccountUsage = false;

export type Options = Extract<MiniflareOptions, { workers: WorkerOptions[] }>;

export async function buildMiniflareOptions(
	log: Log,
	config: Omit<ConfigBundle, "rules">,
	proxyToUserWorkerAuthenticationSecret: UUID,
	remoteProxyConnectionString: RemoteProxyConnectionString | undefined,
	remoteBindingsEnabled: boolean
): Promise<{
	options: Options;
	internalObjects: CfDurableObject[];
	entrypointNames: string[];
}> {
	if (config.crons?.length && !config.testScheduled) {
		if (!didWarnMiniflareCronSupport) {
			didWarnMiniflareCronSupport = true;
			logger.warn(
				"Miniflare does not currently trigger scheduled Workers automatically.\nRefer to https://developers.cloudflare.com/workers/configuration/cron-triggers/#test-cron-triggers for more details "
			);
		}
	}

	if (!remoteBindingsEnabled) {
		if (config.bindings.ai) {
			if (!didWarnAiAccountUsage) {
				didWarnAiAccountUsage = true;
				logger.warn(
					"Using Workers AI always accesses your Cloudflare account in order to run AI models, and so will incur usage charges even in local development."
				);
			}
		}

		if (!config.bindVectorizeToProd && config.bindings.vectorize?.length) {
			logger.warn(
				"Vectorize local bindings are not supported yet. You may use the `--experimental-vectorize-bind-to-prod` flag to bind to your production index in local dev mode."
			);
			config.bindings.vectorize = [];
		}

		if (config.bindings.vectorize?.length) {
			if (!didWarnMiniflareVectorizeSupport) {
				didWarnMiniflareVectorizeSupport = true;
				logger.warn(
					"You are using a mixed-mode binding for Vectorize (through `--experimental-vectorize-bind-to-prod`). It may incur usage charges and modify your databases even in local development. "
				);
			}
		}
	}

	const upstream =
		typeof config.localUpstream === "string"
			? `${config.upstreamProtocol}://${config.localUpstream}`
			: undefined;

	const { sourceOptions, entrypointNames } = await buildSourceOptions(config);
	const { bindingOptions, internalObjects, externalWorkers } =
		buildMiniflareBindingOptions(
			config,
			remoteProxyConnectionString,
			remoteBindingsEnabled
		);
	const sitesOptions = buildSitesOptions(config);
	const defaultPersistRoot = getDefaultPersistRoot(config.localPersistencePath);
	const assetOptions = buildAssetOptions(config);

	const options: MiniflareOptions = {
		host: config.initialIp,
		port: config.initialPort,
		inspectorPort: config.inspect ? config.inspectorPort : undefined,
		liveReload: config.liveReload,
		upstream,
		unsafeProxySharedSecret: proxyToUserWorkerAuthenticationSecret,
		unsafeTriggerHandlers: true,
		// The way we run Miniflare instances with wrangler dev is that there are two:
		//  - one holding the proxy worker,
		//  - and one holding the user worker.
		// The issue with that setup is that end users would see two sets of request logs from Miniflare!
		// Instead of hiding all logs from this Miniflare instance, we specifically hide the request logs,
		// allowing other logs to be shown to the user (such as details about emails being triggered)
		logRequests: false,
		log,
		verbose: logger.loggerLevel === "debug",
		handleRuntimeStdio,
		defaultPersistRoot,
		workers: [
			{
				name: getName(config),
				compatibilityDate: config.compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,

				...sourceOptions,
				...bindingOptions,
				...sitesOptions,
				...assetOptions,
				// Allow each entrypoint to be accessed directly over `127.0.0.1:0`
				unsafeDirectSockets: entrypointNames.map((name) => ({
					host: "127.0.0.1",
					port: 0,
					entrypoint: name,
					proxy: true,
				})),
				containerEngine: config.containerEngine,
			},
			...externalWorkers,
		],
	};
	return { options, internalObjects, entrypointNames };
}

/**
 * Returns the Container options for the DO class name.
 * @returns The configuration or `undefined` when the DO has no attached container
 */
export function getImageNameFromDOClassName(options: {
	doClassName: string;
	containerDOClassNames?: Set<string>;
	containerBuildId?: string;
}): DOContainerOptions | undefined {
	if (!options.containerDOClassNames || !options.containerDOClassNames.size) {
		return undefined;
	}
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
