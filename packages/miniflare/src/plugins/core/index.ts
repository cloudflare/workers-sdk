import assert from "node:assert";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	writeFileSync,
} from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";
import { TextEncoder } from "node:util";
import { DEFAULT_CONTAINER_EGRESS_INTERCEPTOR_IMAGE } from "@cloudflare/containers-shared";
import { getTodaysCompatDate, removeDirSync } from "@cloudflare/workers-utils";
import SCRIPT_DEV_CONTROL from "worker:core/dev-control";
import SCRIPT_ENTRY from "worker:core/entry";
import OUTBOUND_WORKER from "worker:core/outbound";
import { z } from "zod";
import { kVoid } from "../../runtime";
import { MiniflareCoreError, type Log } from "../../shared";
import { getDevControlDurableObjectBindingName } from "../../shared/dev-control";
import { CoreBindings, CoreHeaders, viewToBuffer } from "../../workers";
import { RPC_PROXY_SERVICE_NAME } from "../assets/constants";
import { getCacheServiceName } from "../cache";
import {
	DURABLE_OBJECTS_STORAGE_SERVICE_NAME,
	getDurableObjectUniqueKey,
} from "../do";
import { IMAGES_PLUGIN_NAME } from "../images";
import { getR2PublicService, R2_PUBLIC_SERVICE_NAME } from "../r2";
import {
	buildRemoteProxyProps,
	getUserBindingServiceName,
	parseRoutes,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import {
	getEnvBindingsOfType,
	getExportsOfType,
	getRemoteProxyConnectionString,
} from "../shared";
import { STREAM_PLUGIN_NAME } from "../stream";
import {
	CUSTOM_SERVICE_KNOWN_OUTBOUND,
	CustomServiceKind,
	getCustomFetchServiceName,
	getCustomNodeServiceName,
	getUserServiceName,
	SERVICE_ENTRY,
	SERVICE_LOCAL_EXPLORER,
} from "./constants";
import {
	constructExplorerBindingMap,
	constructExplorerWorkerOpts,
	getExplorerServices,
	wrapDurableObjectModules,
} from "./explorer";
import {
	buildStringScriptPath,
	convertManifestModule,
	withSourceURL,
} from "./modules";
import { PROXY_SECRET } from "./proxy";
import { kCurrentWorker } from "./services";
import type {
	Extension,
	Service,
	ServiceDesignator,
	Worker_Binding,
	Worker_ContainerEngine,
	Worker_DurableObjectNamespace,
	Worker_Module,
} from "../../runtime";
import type { Awaitable } from "../../workers";
import type {
	DurableObjectClassNames,
	MiniflareServiceBinding,
	ParsedDevConfig,
	ParsedInstanceOptions,
	ParsedLegacyConfig,
	ParsedMiniflareWorkerConfig,
	ParsedWorkerOptions,
	Plugin,
} from "../shared";
import type { BindingIdMap } from "./types";

// `workerd`'s `trustBrowserCas` should probably be named `trustSystemCas`.
// Rather than using a bundled CA store like Node, it uses
// `SSL_CTX_set_default_verify_paths()` to use the system CA store:
// https://github.com/capnproto/capnproto/blob/6e26d260d1d91e0465ca12bbb5230a1dfa28f00d/c%2B%2B/src/kj/compat/tls.c%2B%2B#L745
// Unfortunately, this doesn't work on Windows. Luckily, Node exposes its own
// bundled CA store's certificates, so we just use those.
const trustedCertificates =
	process.platform === "win32" ? Array.from(tls.rootCertificates) : [];
if (process.env.NODE_EXTRA_CA_CERTS !== undefined) {
	// Try load extra CA certs if defined, ignoring errors. Node will log a
	// warning if it fails to load this anyway. Note, this we only load this once
	// at process startup to match Node's behaviour:
	// https://nodejs.org/api/cli.html#node_extra_ca_certsfile
	try {
		const extra = readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8");
		// Split bundle into individual certificates and add each individually:
		// https://github.com/cloudflare/miniflare/pull/587/files#r1271579671
		const certs = extra.match(
			/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
		);

		if (certs !== null) {
			trustedCertificates.push(...certs);
		}
	} catch {}
}

const encoder = new TextEncoder();

export type WorkerdStructuredLog = z.infer<typeof WorkerdStructuredLogSchema>;

export const WorkerdStructuredLogSchema = z.object({
	timestamp: z.number(),
	level: z.string(),
	message: z.string(),
});

export const CORE_PLUGIN_NAME = "core";

export const SCRIPT_CUSTOM_FETCH_SERVICE = `addEventListener("fetch", (event) => {
  const request = new Request(event.request);
  request.headers.set("${CoreHeaders.CUSTOM_FETCH_SERVICE}", ${CoreBindings.TEXT_CUSTOM_SERVICE});
  request.headers.set("${CoreHeaders.ORIGINAL_URL}", request.url);
  event.respondWith(${CoreBindings.SERVICE_LOOPBACK}.fetch(request));
})`;

export const SCRIPT_CUSTOM_NODE_SERVICE = `addEventListener("fetch", (event) => {
  const request = new Request(event.request);
  request.headers.set("${CoreHeaders.CUSTOM_NODE_SERVICE}", ${CoreBindings.TEXT_CUSTOM_SERVICE});
  event.respondWith(${CoreBindings.SERVICE_LOOPBACK}.fetch(request));
})`;

function getCustomServiceDesignator(
	refererName: string | undefined,
	workerIndex: number,
	kind: CustomServiceKind,
	name: string,
	service: MiniflareServiceBinding,
	dev: ParsedDevConfig | undefined,
	hasAssetsAndIsVitest: boolean = false
): ServiceDesignator {
	let serviceName: string;
	let entrypoint: string | undefined;
	let props: { json: string } | undefined;
	if (service.type === "fetcher") {
		// Custom `fetch` function
		serviceName = getCustomFetchServiceName(workerIndex, kind, name);
	} else if (service.type === "node-handler") {
		// Custom Node.js style handler
		serviceName = getCustomNodeServiceName(workerIndex, kind, name);
	} else {
		// `worker` service binding
		const remoteProxyConnectionString = getRemoteProxyConnectionString(
			service,
			dev
		);
		if (remoteProxyConnectionString !== undefined) {
			serviceName = `${CORE_PLUGIN_NAME}:remote-proxy-service:${workerIndex}:${name}`;
			// Remote config travels via props to a generic proxy worker.
			props = buildRemoteProxyProps(remoteProxyConnectionString, name);
		} else if (service.workerName === kCurrentWorker) {
			if (service.exportName !== undefined) {
				// SELF with an explicit entrypoint always points to the user worker.
				serviceName = getUserServiceName(refererName);
				entrypoint = service.exportName;
				if (service.props) {
					props = { json: JSON.stringify(service.props) };
				}
			} else {
				// Bare SELF: point to the (assets) RPC Proxy Worker if assets are
				// present and we're running under vitest.
				serviceName = hasAssetsAndIsVitest
					? `${RPC_PROXY_SERVICE_NAME}:${refererName}`
					: getUserServiceName(refererName);
			}
		} else {
			serviceName = getUserServiceName(service.workerName);
			entrypoint = service.exportName;
			if (service.props) {
				props = { json: JSON.stringify(service.props) };
			}
		}
	}
	return { name: serviceName, entrypoint, props };
}

function maybeGetCustomServiceService(
	workerIndex: number,
	kind: CustomServiceKind,
	name: string,
	service: MiniflareServiceBinding,
	dev: ParsedDevConfig | undefined
): Service | undefined {
	if (service.type === "fetcher") {
		// Custom `fetch` function
		return {
			name: getCustomFetchServiceName(workerIndex, kind, name),
			worker: {
				serviceWorkerScript: SCRIPT_CUSTOM_FETCH_SERVICE,
				compatibilityDate: "2022-09-01",
				compatibilityFlags: ["connect_pass_through"],
				bindings: [
					{
						name: CoreBindings.TEXT_CUSTOM_SERVICE,
						text: `${workerIndex}/${kind}${name}`,
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
			},
		};
	} else if (service.type === "node-handler") {
		// Custom Node.js style handler
		return {
			name: getCustomNodeServiceName(workerIndex, kind, name),
			worker: {
				serviceWorkerScript: SCRIPT_CUSTOM_NODE_SERVICE,
				compatibilityDate: "2022-09-01",
				compatibilityFlags: ["connect_pass_through"],
				bindings: [
					{
						name: CoreBindings.TEXT_CUSTOM_SERVICE,
						text: `${workerIndex}/${kind}${name}`,
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
			},
		};
	} else if (getRemoteProxyConnectionString(service, dev) !== undefined) {
		// Remote `worker` service binding
		return {
			name: `${CORE_PLUGIN_NAME}:remote-proxy-service:${workerIndex}:${name}`,
			worker: remoteProxyClientWorker(),
		};
	}
}

const FALLBACK_COMPATIBILITY_DATE = "2000-01-01";

function validateCompatibilityDate(compatibilityDate: string) {
	if (compatibilityDate > getTodaysCompatDate()) {
		// If this compatibility date is in the future, throw
		throw new MiniflareCoreError(
			"ERR_FUTURE_COMPATIBILITY_DATE",
			`Compatibility date "${compatibilityDate}" is in the future and unsupported`
		);
	}
	return compatibilityDate;
}

function getDevControlBindings(
	allWorkerOpts: ParsedWorkerOptions[] | undefined
): Worker_Binding[] {
	const bindings = new Map<string, Worker_Binding>();
	for (const worker of allWorkerOpts ?? []) {
		const workerName = worker.config.name ?? "";
		const userServiceName = getUserServiceName(workerName);

		// Durable Object classes hosted by this worker are declared via its
		// `config.exports` (created `durable-object` exports).
		for (const [className] of getExportsOfType(
			worker.config,
			"durable-object"
		)) {
			const bindingName = getDevControlDurableObjectBindingName(
				workerName,
				className
			);
			bindings.set(bindingName, {
				name: bindingName,
				durableObjectNamespace: {
					serviceName: userServiceName,
					className,
				},
			});
		}
	}

	return Array.from(bindings.values());
}

function getOutboundInterceptorName(workerIndex: number) {
	return `outbound:${workerIndex}`;
}

function getGlobalOutbound(
	workerIndex: number,
	config: ParsedMiniflareWorkerConfig,
	dev: ParsedDevConfig | undefined
) {
	return dev?.outboundService === undefined
		? undefined
		: getCustomServiceDesignator(
				/* referrer */ config.name,
				workerIndex,
				CustomServiceKind.KNOWN,
				CUSTOM_SERVICE_KNOWN_OUTBOUND,
				dev.outboundService,
				dev,
				dev.hasAssetsAndIsVitest
			);
}

function getServiceBindings(
	config: ParsedMiniflareWorkerConfig
): [name: string, binding: MiniflareServiceBinding][] {
	return [
		...getEnvBindingsOfType(config, "worker"),
		...getEnvBindingsOfType(config, "fetcher"),
		...getEnvBindingsOfType(config, "node-handler"),
	];
}

export const CORE_PLUGIN: Plugin = {
	getBindings(options, workerIndex) {
		const { config, legacy, dev } = options;
		const bindings: Awaitable<Worker_Binding>[] = [];

		for (const [name, binding] of getEnvBindingsOfType(config, "json")) {
			bindings.push({ name, json: JSON.stringify(binding.value) });
		}
		for (const [name, binding] of getEnvBindingsOfType(config, "text")) {
			bindings.push({ name, text: binding.value });
		}
		if (legacy?.wasmBindings !== undefined) {
			bindings.push(
				...Object.entries(legacy.wasmBindings).map(([name, value]) =>
					typeof value === "string"
						? fs.readFile(value).then((wasmModule) => ({ name, wasmModule }))
						: { name, wasmModule: value }
				)
			);
		}
		if (legacy?.textBlobBindings !== undefined) {
			bindings.push(
				...Object.entries(legacy.textBlobBindings).map(([name, blobPath]) =>
					fs.readFile(blobPath, "utf8").then((text) => ({ name, text }))
				)
			);
		}
		if (legacy?.dataBlobBindings !== undefined) {
			bindings.push(
				...Object.entries(legacy.dataBlobBindings).map(([name, value]) =>
					typeof value === "string"
						? fs.readFile(value).then((data) => ({ name, data }))
						: { name, data: value }
				)
			);
		}
		for (const [name, service] of getServiceBindings(config)) {
			bindings.push({
				name,
				service: getCustomServiceDesignator(
					/* referrer */ config.name,
					workerIndex,
					CustomServiceKind.UNKNOWN,
					name,
					service,
					dev,
					dev?.hasAssetsAndIsVitest
				),
			});
		}
		if (dev?.unsafeEvalBinding !== undefined) {
			bindings.push({
				name: dev.unsafeEvalBinding,
				unsafeEval: kVoid,
			});
		}

		return Promise.all(bindings);
	},
	async getNodeBindings(options) {
		const { config, legacy } = options;
		const bindingEntries: Awaitable<unknown[]>[] = [];

		for (const [name, binding] of getEnvBindingsOfType(config, "json")) {
			bindingEntries.push([name, JSON.parse(JSON.stringify(binding.value))]);
		}
		for (const [name, binding] of getEnvBindingsOfType(config, "text")) {
			bindingEntries.push([name, binding.value]);
		}
		if (legacy?.wasmBindings !== undefined) {
			bindingEntries.push(
				...Object.entries(legacy.wasmBindings).map(([name, value]) =>
					typeof value === "string"
						? fs
								.readFile(value)
								.then((buffer) => [name, new WebAssembly.Module(buffer)])
						: [name, new WebAssembly.Module(value)]
				)
			);
		}
		if (legacy?.textBlobBindings !== undefined) {
			bindingEntries.push(
				...Object.entries(legacy.textBlobBindings).map(([name, blobPath]) =>
					fs.readFile(blobPath, "utf8").then((text) => [name, text])
				)
			);
		}
		if (legacy?.dataBlobBindings !== undefined) {
			bindingEntries.push(
				...Object.entries(legacy.dataBlobBindings).map(([name, value]) =>
					typeof value === "string"
						? fs.readFile(value).then((buffer) => [name, viewToBuffer(buffer)])
						: [name, viewToBuffer(value)]
				)
			);
		}
		for (const [name] of getServiceBindings(config)) {
			bindingEntries.push([name, new ProxyNodeBinding()]);
		}
		return Object.fromEntries(await Promise.all(bindingEntries));
	},
	async getServices({
		options,
		sharedOptions,
		workerBindings,
		workerIndex,
		durableObjectClassNames,
		additionalModules,
		loopbackHost,
		loopbackPort,
	}) {
		const { config, legacy, dev } = options;
		// Define regular user worker
		const workerScript = getWorkerScript(config, legacy, workerIndex);
		// Add additional modules (e.g. "__STATIC_CONTENT_MANIFEST") if any
		if ("modules" in workerScript) {
			const subDirs = new Set(
				workerScript.modules.map(({ name }) => path.posix.dirname(name))
			);
			// Ignore `.` as it's not a subdirectory, and we don't want to register
			// additional modules in the root twice.
			subDirs.delete(".");

			for (const module of additionalModules) {
				workerScript.modules.push(module);
				// In addition to adding the module, we add stub modules in each
				// subdirectory re-exporting each additional module. These allow
				// additional modules to be imported in every directory.
				for (const subDir of subDirs) {
					const relativePath = path.posix.relative(subDir, module.name);
					const relativePathString = JSON.stringify(relativePath);
					workerScript.modules.push({
						name: path.posix.join(subDir, module.name),
						// TODO(someday): if we ever have additional modules without
						//  default exports, this may be a problem. For now, our only
						//  additional module is `__STATIC_CONTENT_MANIFEST` so it's fine.
						//  If needed, we could look for instances of `export default` or
						//  `as default` in the module's code as a heuristic.
						esModule: `export * from ${relativePathString}; export { default } from ${relativePathString};`,
					});
				}
			}
		}

		const serviceName = getUserServiceName(config.name);
		const classNames = durableObjectClassNames.get(serviceName);
		const classNamesEntries = Array.from(classNames ?? []);

		// Wrap Durable Object classes for the local explorer
		// This injects a method onto user defined DO classes to allow
		// us to introspect the sqlite databases, since these are not
		// available on the stub.
		const sqliteClasses = classNamesEntries.filter(
			([, { enableSql }]) => enableSql
		);
		if (
			(sharedOptions.unsafeLocalExplorer ||
				sharedOptions.unsafeInspectDurableObjects) &&
			// service-format workers are not supported
			"modules" in workerScript &&
			sqliteClasses.length > 0 &&
			"esModule" in workerScript.modules[0]
		) {
			workerScript.modules = wrapDurableObjectModules(
				workerScript.modules,
				sqliteClasses.map(([className]) => className)
			);
		}

		const compatibilityDate = validateCompatibilityDate(
			config.compatibilityDate ?? FALLBACK_COMPATIBILITY_DATE
		);

		const services: Service[] = [];
		const extensions: Extension[] = [];

		const tailConsumers = config.tailConsumers ?? [];

		services.push({
			name: serviceName,
			worker: {
				...workerScript,
				compatibilityDate,
				compatibilityFlags: config.compatibilityFlags,
				bindings: workerBindings,
				durableObjectNamespaces:
					classNamesEntries.map<Worker_DurableObjectNamespace>(
						([
							className,
							{
								enableSql,
								unsafeUniqueKey,
								unsafePreventEviction: preventEviction,
								container,
							},
						]) => {
							const uniqueKey = getDurableObjectUniqueKey(
								className,
								config.name,
								unsafeUniqueKey
							);

							return uniqueKey === undefined
								? {
										className,
										enableSql,
										ephemeralLocal: kVoid,
										preventEviction,
										container,
									}
								: {
										className,
										enableSql,
										uniqueKey,
										preventEviction,
										container,
									};
						}
					),
				durableObjectStorage:
					classNamesEntries.length === 0
						? undefined
						: dev?.unsafeEphemeralDurableObjects
							? { inMemory: kVoid }
							: { localDisk: DURABLE_OBJECTS_STORAGE_SERVICE_NAME },
				globalOutbound: { name: getOutboundInterceptorName(workerIndex) },
				cacheApiOutbound: { name: getCacheServiceName(workerIndex) },
				moduleFallback:
					dev?.useModuleFallbackService &&
					sharedOptions.unsafeModuleFallbackService !== undefined
						? `${loopbackHost}:${loopbackPort}`
						: undefined,
				tails: tailConsumers
					.filter((consumer) => !consumer.streaming)
					.map<ServiceDesignator>((consumer) => ({
						name: getUserServiceName(consumer.workerName),
					})),
				streamingTails: tailConsumers
					.filter((consumer) => consumer.streaming)
					.map<ServiceDesignator>((consumer) => ({
						name: getUserServiceName(consumer.workerName),
					})),
				containerEngine: getContainerEngine(sharedOptions.containerEngine),
			},
		});

		// Define custom `fetch`/`node-handler` services if set
		for (const [name, service] of getServiceBindings(config)) {
			const maybeService = maybeGetCustomServiceService(
				workerIndex,
				CustomServiceKind.UNKNOWN,
				name,
				service,
				dev
			);
			if (maybeService !== undefined) services.push(maybeService);
		}

		if (dev?.outboundService !== undefined) {
			const maybeService = maybeGetCustomServiceService(
				workerIndex,
				CustomServiceKind.KNOWN,
				CUSTOM_SERVICE_KNOWN_OUTBOUND,
				dev.outboundService,
				dev
			);
			if (maybeService !== undefined) services.push(maybeService);
		}

		{
			// Use the zone option if provided, otherwise default to `${worker-name}.example.com`
			const workerName = config.name ?? "worker";
			const cfWorkerValue = dev?.zone ?? `${workerName}.example.com`;
			services.push({
				name: getOutboundInterceptorName(workerIndex),
				worker: {
					modules: [
						{
							name: "index.js",
							esModule: OUTBOUND_WORKER(),
						},
					],
					compatibilityDate: "2025-01-01",
					compatibilityFlags: ["connect_pass_through", "experimental"],
					bindings: [
						{
							name: "CF_WORKER_ZONE",
							text: cfWorkerValue,
						},
						{
							name: "STRIP_CF_CONNECTING_IP",
							json: JSON.stringify(dev?.stripCfConnectingIp ?? true),
						},
						WORKER_BINDING_SERVICE_LOOPBACK,
					],
					globalOutbound: getGlobalOutbound(workerIndex, config, dev),
				},
			});
		}

		return { services, extensions };
	},
};

export interface GlobalServicesOptions {
	sharedOptions: ParsedInstanceOptions;
	allWorkerRoutes: Map<string, string[]>;
	fallbackWorkerName: string | undefined;
	tmpPath: string;
	log: Log;
	/** All user workerd-native bindings, used for Miniflare's magic proxy and the local explorer worker */
	proxyBindings: Worker_Binding[];
	/** Pass Durable Object configuration for the explorer worker (has more info than proxyBindings)*/
	durableObjectClassNames: DurableObjectClassNames;
	/** All worker options for building per-worker resource bindings */
	allWorkerOpts?: ParsedWorkerOptions[];
}
export function getGlobalServices({
	sharedOptions,
	allWorkerRoutes,
	fallbackWorkerName,
	tmpPath,
	log,
	proxyBindings,
	durableObjectClassNames,
	allWorkerOpts,
}: GlobalServicesOptions): Service[] {
	// Collect list of workers we could route to, then parse and sort all routes
	const workerNames = [...allWorkerRoutes.keys()];
	const routes = parseRoutes(allWorkerRoutes);

	// Define core/shared services.
	const serviceEntryBindings: Worker_Binding[] = [
		WORKER_BINDING_SERVICE_LOOPBACK, // For converting stack-traces to pretty-error pages
		{ name: CoreBindings.JSON_ROUTES, json: JSON.stringify(routes) },
		{
			name: CoreBindings.TRIGGER_HANDLERS,
			json: JSON.stringify(!!sharedOptions.unsafeTriggerHandlers),
		},
		{
			name: CoreBindings.LOG_REQUESTS,
			json: JSON.stringify(!!sharedOptions.logRequests),
		},
		{ name: CoreBindings.JSON_CF_BLOB, json: JSON.stringify(sharedOptions.cf) },
		{ name: CoreBindings.JSON_LOG_LEVEL, json: JSON.stringify(log.level) },
		{
			name: CoreBindings.SERVICE_USER_FALLBACK,
			service: { name: fallbackWorkerName },
		},
		...workerNames.map((name) => ({
			name: CoreBindings.SERVICE_USER_ROUTE_PREFIX + name,
			service: { name: getUserServiceName(name) },
		})),
		{
			name: CoreBindings.DURABLE_OBJECT_NAMESPACE_PROXY,
			durableObjectNamespace: { className: "ProxyServer" },
		},
		{
			name: CoreBindings.DATA_PROXY_SECRET,
			data: PROXY_SECRET,
		},
		{
			name: CoreBindings.STRIP_DISABLE_PRETTY_ERROR,
			json: JSON.stringify(sharedOptions.stripDisablePrettyError),
		},
		// Add `proxyBindings` here, they'll be added to the `ProxyServer` `env`
		...proxyBindings,
		// Add cache service binding for purgeCache() API
		{
			name: CoreBindings.SERVICE_CACHE,
			service: { name: getCacheServiceName(0) },
		},
		{
			name: CoreBindings.SERVICE_DEV_CONTROL,
			service: { name: CoreBindings.SERVICE_DEV_CONTROL },
		},
	];
	if (sharedOptions.unsafeLocalExplorer) {
		serviceEntryBindings.push({
			name: CoreBindings.SERVICE_LOCAL_EXPLORER,
			service: {
				name: SERVICE_LOCAL_EXPLORER,
			},
		});
	}
	const streamServiceEnabled = allWorkerOpts?.some((worker) =>
		getEnvBindingsOfType(worker.config, "stream").some(
			([, binding]) =>
				getRemoteProxyConnectionString(binding, worker.dev) === undefined
		)
	);
	if (streamServiceEnabled) {
		serviceEntryBindings.push({
			name: CoreBindings.SERVICE_STREAM,
			service: {
				name: getUserBindingServiceName(STREAM_PLUGIN_NAME, "service"),
				entrypoint: "StreamBinding",
			},
		});
	}
	const r2PublicService = getR2PublicService(allWorkerOpts ?? []);
	if (r2PublicService !== undefined) {
		serviceEntryBindings.push({
			name: CoreBindings.SERVICE_R2_PUBLIC,
			service: { name: R2_PUBLIC_SERVICE_NAME },
		});
	}
	let imagesServiceName: string | undefined;
	for (const worker of allWorkerOpts ?? []) {
		for (const [name, binding] of getEnvBindingsOfType(
			worker.config,
			"images"
		)) {
			if (getRemoteProxyConnectionString(binding, worker.dev) === undefined) {
				imagesServiceName = getUserBindingServiceName(IMAGES_PLUGIN_NAME, name);
				break;
			}
		}
		if (imagesServiceName !== undefined) {
			break;
		}
	}
	if (imagesServiceName !== undefined) {
		serviceEntryBindings.push({
			name: CoreBindings.SERVICE_IMAGES_DELIVERY,
			service: { name: imagesServiceName },
		});
	}
	if (sharedOptions.upstream !== undefined) {
		serviceEntryBindings.push({
			name: CoreBindings.TEXT_UPSTREAM_URL,
			text: sharedOptions.upstream,
		});
	}
	if (sharedOptions.unsafeProxySharedSecret !== undefined) {
		serviceEntryBindings.push({
			name: CoreBindings.DATA_PROXY_SHARED_SECRET,
			data: encoder.encode(sharedOptions.unsafeProxySharedSecret),
		});
	}
	const services: Service[] = [
		{
			name: SERVICE_LOOPBACK,
			external: { http: { cfBlobHeader: CoreHeaders.CF_BLOB } },
		},
		{
			name: SERVICE_ENTRY,
			worker: {
				modules: [{ name: "entry.worker.js", esModule: SCRIPT_ENTRY() }],
				compatibilityDate: "2025-03-17",
				compatibilityFlags: ["nodejs_compat", "service_binding_extra_handlers"],
				bindings: serviceEntryBindings,
				durableObjectNamespaces: [
					{
						className: "ProxyServer",
						uniqueKey: `${SERVICE_ENTRY}-ProxyServer`,
						// `ProxyServer` relies on a singleton object containing of "heap"
						// mapping addresses to native references. If the singleton object
						// were evicted, addresses would be invalidated. Therefore, we
						// prevent eviction to ensure heap addresses stay valid for the
						// lifetime of the `workerd` process
						preventEviction: true,
					},
				],
				// `ProxyServer` doesn't make use of Durable Object storage
				durableObjectStorage: { inMemory: kVoid },
				// Always use the entrypoints cache implementation for proxying. This
				// means if the entrypoint disables caching, proxied cache operations
				// will be no-ops. Note we always require at least one worker to be set.
				cacheApiOutbound: { name: "cache:0" },
			},
		},
		{
			name: CoreBindings.SERVICE_DEV_CONTROL,
			worker: {
				modules: [
					{ name: "dev-control.worker.js", esModule: SCRIPT_DEV_CONTROL() },
				],
				compatibilityDate: "2026-07-08",
				compatibilityFlags: ["unsafe_module"],
				bindings: getDevControlBindings(allWorkerOpts),
			},
		},
		{
			name: "internet",
			network: {
				// Allow access to private/public addresses:
				// https://github.com/cloudflare/miniflare/issues/412
				allow: ["public", "private", "240.0.0.0/4"],
				deny: [],
				tlsOptions: {
					trustBrowserCas: true,
					trustedCertificates,
				},
			},
		},
	];

	if (r2PublicService !== undefined) {
		services.push(r2PublicService);
	}

	if (sharedOptions.unsafeLocalExplorer) {
		const localExplorerUiPath = resolveLocalExplorerUi(tmpPath);
		const IDToBindingMap: BindingIdMap = constructExplorerBindingMap(
			proxyBindings,
			durableObjectClassNames
		);
		const hasDurableObjects = Object.keys(IDToBindingMap.do).length > 0;

		const explorerWorkerOpts = constructExplorerWorkerOpts(
			allWorkerOpts ?? [],
			durableObjectClassNames
		);
		services.push(
			...getExplorerServices({
				localExplorerUiPath,
				proxyBindings,
				bindingIdMap: IDToBindingMap,
				hasDurableObjects,
				workerNames,
				explorerWorkerOpts,
				telemetry: sharedOptions.telemetry,
			})
		);
	}

	return services;
}

/**
 * workerd's disk service needs a real filesystem directory. Under Yarn PnP,
 * these bundled assets can live inside a real `.yarn/cache/*.zip` archive.
 * Node can still read those paths through Yarn's patched filesystem hooks, but
 * workerd can't mount a directory from inside the zip as a disk service.
 */
function resolveLocalExplorerUi(tmpPath: string) {
	const bundledLocalExplorerUiPath = path.join(
		__dirname,
		"../local-explorer-ui"
	);
	if (!existsSync(bundledLocalExplorerUiPath)) {
		throw new MiniflareCoreError(
			"ERR_MISSING_EXPLORER_UI",
			`Local Explorer UI assets not found at expected path: ${bundledLocalExplorerUiPath}`
		);
	}
	if (!isPathInsideZip(bundledLocalExplorerUiPath)) {
		return bundledLocalExplorerUiPath;
	}

	const localExplorerUiPath = path.join(
		tmpPath,
		CORE_PLUGIN_NAME,
		"local-explorer-ui"
	);
	if (!existsSync(localExplorerUiPath)) {
		const localExplorerUiRoot = path.dirname(localExplorerUiPath);
		const stagedLocalExplorerUiPath = path.join(
			localExplorerUiRoot,
			`local-explorer-ui-staging-${process.pid}-${Date.now()}`
		);

		mkdirSync(localExplorerUiRoot, { recursive: true });
		try {
			copyDirectorySync(bundledLocalExplorerUiPath, stagedLocalExplorerUiPath);
			renameSync(stagedLocalExplorerUiPath, localExplorerUiPath);
		} catch (error) {
			removeDirSync(stagedLocalExplorerUiPath);
			throw error;
		}
	}

	return localExplorerUiPath;
}

function isPathInsideZip(filePath: string) {
	let currentPath = path.dirname(filePath);

	while (currentPath !== path.dirname(currentPath)) {
		if (path.extname(currentPath) === ".zip") {
			const zipStats = statSync(currentPath, { throwIfNoEntry: false });
			if (zipStats?.isFile()) {
				return true;
			}
		}

		currentPath = path.dirname(currentPath);
	}

	return false;
}

/**
 * `cpSync()` treats the zip-backed PnP source path like a normal on-disk
 * directory and hits `ENOTDIR` when that path actually points inside a `.zip`
 * archive.
 * `readdirSync()`, `statSync()`, and `readFileSync()` still work through
 * Yarn's patched fs hooks, so copy the tree entry-by-entry instead.
 */
function copyDirectorySync(sourcePath: string, destinationPath: string) {
	mkdirSync(destinationPath, { recursive: true });
	for (const entry of readdirSync(sourcePath)) {
		const sourceEntryPath = path.join(sourcePath, entry);
		const destinationEntryPath = path.join(destinationPath, entry);
		const sourceEntryStats = statSync(sourceEntryPath);

		if (sourceEntryStats.isDirectory()) {
			copyDirectorySync(sourceEntryPath, destinationEntryPath);
		} else {
			writeFileSync(destinationEntryPath, readFileSync(sourceEntryPath));
		}
	}
}

function getWorkerScript(
	config: ParsedMiniflareWorkerConfig,
	legacy: ParsedLegacyConfig | undefined,
	workerIndex: number
): { serviceWorkerScript: string } | { modules: Worker_Module[] } {
	// Service-worker format scripts are provided directly by the caller.
	if (legacy?.serviceWorkerScript !== undefined) {
		return {
			serviceWorkerScript: withSourceURL(
				legacy.serviceWorkerScript,
				buildStringScriptPath(workerIndex)
			),
		};
	}

	// Otherwise, build modules from the manifest (contents are provided inline).
	const manifest = config.manifest;
	assert(manifest !== undefined, "Unreachable: Workers must have code");
	const entry = manifest.modules[manifest.mainModule];
	assert(
		entry !== undefined,
		`Manifest \`mainModule\` "${manifest.mainModule}" is not present in \`modules\``
	);

	const modules: Worker_Module[] = [
		// workerd uses the first module as the entrypoint, so it must come first.
		convertManifestModule(manifest.mainModule, entry.type, entry.contents),
	];
	for (const [name, module] of Object.entries(manifest.modules)) {
		if (name === manifest.mainModule) {
			continue;
		}
		modules.push(convertManifestModule(name, module.type, module.contents));
	}
	return { modules };
}

/**
 * Returns the default containerEgressInterceptorImage. It's used for
 * container network interception for local dev.
 */
function getContainerEgressInterceptorImage(): string {
	return (
		process.env.MINIFLARE_CONTAINER_EGRESS_IMAGE ??
		DEFAULT_CONTAINER_EGRESS_INTERCEPTOR_IMAGE
	);
}

/**
 * Returns the Container engine configuration
 * @param engineOrSocketPath Either a full engine config or a unix socket
 * @returns The container engine, defaulting to the default docker socket located on linux/macOS at `unix:///var/run/docker.sock`
 */
function getContainerEngine(
	engineOrSocketPath: Worker_ContainerEngine | string | undefined
): Worker_ContainerEngine {
	if (!engineOrSocketPath) {
		// TODO: workerd does not support win named pipes
		engineOrSocketPath =
			process.platform === "win32"
				? "//./pipe/docker_engine"
				: "unix:///var/run/docker.sock";
	}

	// Egress interceptor is to support direct connectivity between the Container and Workers,
	// it spawns a container in the same network namespace as the local dev container and
	// intercepts traffic to redirect to Workerd.
	const egressImage = getContainerEgressInterceptorImage();

	if (typeof engineOrSocketPath === "string") {
		return {
			localDocker: {
				socketPath: engineOrSocketPath,
				containerEgressInterceptorImage: egressImage,
			},
		};
	}

	return {
		localDocker: {
			...engineOrSocketPath.localDocker,
			containerEgressInterceptorImage:
				engineOrSocketPath.localDocker.containerEgressInterceptorImage ??
				egressImage,
		},
	};
}

export * from "./errors";
export * from "./proxy";
export * from "./constants";
export * from "./modules";
export * from "./services";
export * from "./node-compat";
