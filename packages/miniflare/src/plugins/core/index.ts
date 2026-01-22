import assert from "node:assert";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import tls from "node:tls";
import { TextEncoder } from "node:util";
import { bold } from "kleur/colors";
import { MockAgent } from "undici";
import SCRIPT_ENTRY from "worker:core/entry";
import STRIP_CF_CONNECTING_IP from "worker:core/strip-cf-connecting-ip";
import SCRIPT_LOCAL_EXPLORER_API from "worker:local-explorer/api";
import { z } from "zod";
import { fetch } from "../../http";
import {
	Extension,
	kVoid,
	Service,
	ServiceDesignator,
	supportedCompatibilityDate,
	Worker_Binding,
	Worker_ContainerEngine,
	Worker_DurableObjectNamespace,
	Worker_Module,
} from "../../runtime";
import {
	Json,
	JsonSchema,
	Log,
	MiniflareCoreError,
	PathSchema,
} from "../../shared";
import {
	Awaitable,
	CoreBindings,
	CoreHeaders,
	viewToBuffer,
} from "../../workers";
import { RPC_PROXY_SERVICE_NAME } from "../assets/constants";
import { getCacheServiceName } from "../cache";
import { DURABLE_OBJECTS_STORAGE_SERVICE_NAME } from "../do";
import {
	kUnsafeEphemeralUniqueKey,
	parseRoutes,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import {
	CUSTOM_SERVICE_KNOWN_OUTBOUND,
	CustomServiceKind,
	getBuiltinServiceName,
	getCustomFetchServiceName,
	getCustomNodeServiceName,
	getUserServiceName,
	SERVICE_ENTRY,
	SERVICE_LOCAL_EXPLORER,
} from "./constants";
import {
	buildStringScriptPath,
	convertModuleDefinition,
	ModuleLocator,
	SourceOptions,
	SourceOptionsSchema,
	withSourceURL,
} from "./modules";
import { PROXY_SECRET } from "./proxy";
import {
	CustomFetchServiceSchema,
	kCurrentWorker,
	ServiceDesignatorSchema,
} from "./services";
import type { WorkerRegistry } from "../../shared/dev-registry";

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
const numericCompare = new Intl.Collator(undefined, { numeric: true }).compare;

export function createFetchMock() {
	return new MockAgent();
}

const WrappedBindingSchema = z.object({
	scriptName: z.string(),
	entrypoint: z.string().optional(),
	bindings: z.record(JsonSchema).optional(),
});

// Validate as string, but don't include in parsed output
const UnusableStringSchema = z.string().transform(() => undefined);

export const UnsafeDirectSocketSchema = z.object({
	host: z.ostring(),
	port: z.onumber(),
	serviceName: z.ostring(),
	entrypoint: z.ostring(),
	proxy: z.oboolean(),
});

export const ExternalPluginSpecifier = z.object({
	package: z.string(),
	name: z.string(),
});

const CoreOptionsSchemaInput = z.intersection(
	SourceOptionsSchema,
	z.object({
		name: z.string().optional(),
		rootPath: UnusableStringSchema.optional(),

		compatibilityDate: z.string().optional(),
		compatibilityFlags: z.string().array().optional(),

		unsafeInspectorProxy: z.boolean().optional(),

		routes: z.string().array().optional(),

		bindings: z.record(JsonSchema).optional(),
		wasmBindings: z
			.record(z.union([PathSchema, z.instanceof(Uint8Array)]))
			.optional(),
		textBlobBindings: z.record(PathSchema).optional(),
		dataBlobBindings: z
			.record(z.union([PathSchema, z.instanceof(Uint8Array)]))
			.optional(),
		serviceBindings: z.record(ServiceDesignatorSchema).optional(),
		wrappedBindings: z
			.record(z.union([z.string(), WrappedBindingSchema]))
			.optional(),

		outboundService: ServiceDesignatorSchema.optional(),
		fetchMock: z.instanceof(MockAgent).optional(),

		// TODO(soon): remove this in favour of per-object `unsafeUniqueKey: kEphemeralUniqueKey`
		unsafeEphemeralDurableObjects: z.boolean().optional(),
		unsafeDirectSockets: UnsafeDirectSocketSchema.array().optional(),

		unsafeEvalBinding: z.string().optional(),
		unsafeUseModuleFallbackService: z.boolean().optional(),

		/** Used to set the vitest pool worker SELF binding to point to the Router Worker if there are assets.
		 (If there are assets but we're not using vitest, the miniflare entry worker can point directly to
		 Router Worker)
		 */
		hasAssetsAndIsVitest: z.boolean().optional(),

		tails: z.array(ServiceDesignatorSchema).optional(),
		streamingTails: z.array(ServiceDesignatorSchema).optional(),

		// Strip the CF-Connecting-IP header from outbound fetches
		stripCfConnectingIp: z.boolean().default(true),

		/** Configuration used to connect to the container engine */
		containerEngine: z
			.union([
				z.object({
					localDocker: z.object({ socketPath: z.string() }),
				}),
				z.string(),
			])
			.optional(),

		unsafeBindings: z
			.array(
				z.object({
					name: z.string(),
					type: z.string(),
					plugin: ExternalPluginSpecifier,
					options: z.record(JsonSchema),
				})
			)
			.optional(),
	})
);
export const CoreOptionsSchema = CoreOptionsSchemaInput.transform((value) => {
	const fetchMock = value.fetchMock;
	if (fetchMock !== undefined) {
		if (value.outboundService !== undefined) {
			throw new MiniflareCoreError(
				"ERR_MULTIPLE_OUTBOUNDS",
				"Only one of `outboundService` or `fetchMock` may be specified per worker"
			);
		}

		// The `fetchMock` option is used to construct the `outboundService` only
		// Removing it from the output allows us to re-parse the options later
		// This allows us to validate the options and then feed them into Miniflare without issue.
		value.fetchMock = undefined;
		value.outboundService = (req) => fetch(req, { dispatcher: fetchMock });
	}
	return value;
});

export type WorkerdStructuredLog = z.infer<typeof WorkerdStructuredLogSchema>;

export const WorkerdStructuredLogSchema = z.object({
	timestamp: z.number(),
	level: z.string(),
	message: z.string(),
});

export const CoreSharedOptionsSchema = z
	.object({
		rootPath: UnusableStringSchema.optional(),

		host: z.string().optional(),
		port: z.number().optional(),

		https: z.boolean().optional(),
		httpsKey: z.string().optional(),
		httpsKeyPath: z.string().optional(),
		httpsCert: z.string().optional(),
		httpsCertPath: z.string().optional(),

		inspectorPort: z.number().optional(),
		inspectorHost: z.string().optional(),

		verbose: z.boolean().optional(),

		log: z.instanceof(Log).optional(),
		handleRuntimeStdio: z
			.function(z.tuple([z.instanceof(Readable), z.instanceof(Readable)]))
			.optional(),

		handleStructuredLogs: z
			.function(z.tuple([WorkerdStructuredLogSchema]))
			.returns(z.void())
			.optional(),

		upstream: z.string().optional(),
		// TODO: add back validation of cf object
		cf: z.union([z.boolean(), z.string(), z.record(z.any())]).optional(),

		liveReload: z.boolean().optional(),

		// Enable auto service / durable objects discovery with the dev registry
		unsafeDevRegistryPath: z.string().optional(),
		// Enable External Durable Objects Proxy / Internal DOs registration
		unsafeDevRegistryDurableObjectProxy: z.boolean().default(false),
		// Called when external workers this instance depends on are updated in the dev registry
		unsafeHandleDevRegistryUpdate: z
			.function(z.tuple([z.custom<WorkerRegistry>()]))
			.optional(),
		// This is a shared secret between a proxy server and miniflare that can be
		// passed in a header to prove that the request came from the proxy and not
		// some malicious attacker.
		unsafeProxySharedSecret: z.string().optional(),
		unsafeModuleFallbackService: CustomFetchServiceSchema.optional(),
		// Keep blobs when deleting/overwriting keys, required for stacked storage
		unsafeStickyBlobs: z.boolean().optional(),
		// Enable directly triggering user Worker handlers with paths like `/cdn-cgi/handler/scheduled`
		unsafeTriggerHandlers: z.boolean().optional(),
		// Enable the local explorer at /cdn-cgi/explorer
		unsafeLocalExplorer: z.boolean().optional(),
		// Enable logging requests
		logRequests: z.boolean().default(true),

		// Path to the root directory for persisting data
		// Used as the default for all plugins with the plugin name as the subdirectory name
		defaultPersistRoot: z.string().optional(),
		// Strip the MF-DISABLE_PRETTY_ERROR header from user request
		stripDisablePrettyError: z.boolean().default(true),

		// Whether to get structured logs from workerd or not (defaults to `true` is a
		// `handleStructuredLogs` is set, to `false` otherwise)
		// This option is useful in combination with a custom handleRuntimeStdio.
		structuredWorkerdLogs: z.boolean().optional(),
	})
	.refine(
		({ structuredWorkerdLogs, handleStructuredLogs }) => {
			if (structuredWorkerdLogs === false && handleStructuredLogs) {
				return false;
			}
			return true;
		},
		{
			message:
				"A `handleStructuredLogs` has been provided but `structuredWorkerdLogs` is set to `false`",
		}
	);

export const CORE_PLUGIN_NAME = "core";

const LIVE_RELOAD_SCRIPT_TEMPLATE = (
	port: number
) => `<script defer type="application/javascript">
(function () {
  // Miniflare Live Reload
  var url = new URL("/cdn-cgi/mf/reload", location.origin);
  url.protocol = url.protocol.replace("http", "ws");
  url.port = ${port};
  function reload() { location.reload(); }
  function connect(reconnected) {
    var ws = new WebSocket(url);
    if (reconnected) ws.onopen = reload;
    ws.onclose = function(e) {
      e.code === 1012 ? reload() : e.code === 1000 || e.code === 1001 || setTimeout(connect, 1000, true);
    }
  }
  connect();
})();
</script>`;

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
	service: z.infer<typeof ServiceDesignatorSchema>,
	hasAssetsAndIsVitest: boolean = false
): ServiceDesignator {
	let serviceName: string;
	let entrypoint: string | undefined;
	let props: { json: string } | undefined;
	if (typeof service === "function") {
		// Custom `fetch` function
		serviceName = getCustomFetchServiceName(workerIndex, kind, name);
	} else if (typeof service === "object") {
		if ("node" in service) {
			serviceName = getCustomNodeServiceName(workerIndex, kind, name);
		} else if ("remoteProxyConnectionString" in service) {
			assert("name" in service && typeof service.name === "string");
			serviceName = `${CORE_PLUGIN_NAME}:remote-proxy-service:${workerIndex}:${name}`;
		}
		// Worker with entrypoint
		else if ("name" in service) {
			if (service.name === kCurrentWorker) {
				// TODO when fetch on WorkerEntrypoints with assets is fixed in dev: point this Router Worker if assets are present.
				serviceName = getUserServiceName(refererName);
			} else {
				serviceName = getUserServiceName(service.name);
			}
			entrypoint = service.entrypoint;
			if (service.props) {
				props = { json: JSON.stringify(service.props) };
			}
		} else {
			// Builtin workerd service: network, external, disk
			serviceName = getBuiltinServiceName(workerIndex, kind, name);
		}
	} else if (service === kCurrentWorker) {
		// Sets SELF binding to point to the (assets) RPC Proxy Worker
		// if assets are present.
		serviceName = hasAssetsAndIsVitest
			? `${RPC_PROXY_SERVICE_NAME}:${refererName}`
			: getUserServiceName(refererName);
	} else {
		// Regular user worker
		serviceName = getUserServiceName(service);
	}
	return { name: serviceName, entrypoint, props };
}

function maybeGetCustomServiceService(
	workerIndex: number,
	kind: CustomServiceKind,
	name: string,
	service: z.infer<typeof ServiceDesignatorSchema>
): Service | undefined {
	if (typeof service === "function") {
		// Custom `fetch` function
		return {
			name: getCustomFetchServiceName(workerIndex, kind, name),
			worker: {
				serviceWorkerScript: SCRIPT_CUSTOM_FETCH_SERVICE,
				compatibilityDate: "2022-09-01",
				bindings: [
					{
						name: CoreBindings.TEXT_CUSTOM_SERVICE,
						text: `${workerIndex}/${kind}${name}`,
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
			},
		};
	} else if (typeof service === "object" && "node" in service) {
		// Custom Node.js style handler
		return {
			name: getCustomNodeServiceName(workerIndex, kind, name),
			worker: {
				serviceWorkerScript: SCRIPT_CUSTOM_NODE_SERVICE,
				compatibilityDate: "2022-09-01",
				bindings: [
					{
						name: CoreBindings.TEXT_CUSTOM_SERVICE,
						text: `${workerIndex}/${kind}${name}`,
					},
					WORKER_BINDING_SERVICE_LOOPBACK,
				],
			},
		};
	} else if (typeof service === "object" && !("name" in service)) {
		// Builtin workerd service: network, external, disk
		return {
			name: getBuiltinServiceName(workerIndex, kind, name),
			...service,
		};
	} else if (
		typeof service === "object" &&
		service.remoteProxyConnectionString !== undefined
	) {
		assert(
			service.remoteProxyConnectionString &&
				service.name &&
				typeof service.name === "string"
		);

		return {
			name: `${CORE_PLUGIN_NAME}:remote-proxy-service:${workerIndex}:${name}`,
			worker: remoteProxyClientWorker(
				service.remoteProxyConnectionString,
				name
			),
		};
	}
}

const FALLBACK_COMPATIBILITY_DATE = "2000-01-01";

function getCurrentCompatibilityDate() {
	// Get current compatibility date in UTC timezone
	const now = new Date().toISOString();
	return now.substring(0, now.indexOf("T"));
}

function validateCompatibilityDate(log: Log, compatibilityDate: string) {
	if (numericCompare(compatibilityDate, getCurrentCompatibilityDate()) > 0) {
		// If this compatibility date is in the future, throw
		throw new MiniflareCoreError(
			"ERR_FUTURE_COMPATIBILITY_DATE",
			`Compatibility date "${compatibilityDate}" is in the future and unsupported`
		);
	} else if (
		numericCompare(compatibilityDate, supportedCompatibilityDate) > 0
	) {
		// If this compatibility date is greater than the maximum supported
		// compatibility date of the runtime, but not in the future, warn,
		// and use the maximum supported date instead
		log.warn(
			[
				"The latest compatibility date supported by the installed Cloudflare Workers Runtime is ",
				bold(`"${supportedCompatibilityDate}"`),
				",\nbut you've requested ",
				bold(`"${compatibilityDate}"`),
				". Falling back to ",
				bold(`"${supportedCompatibilityDate}"`),
				"...",
			].join("")
		);
		return supportedCompatibilityDate;
	}
	return compatibilityDate;
}

function buildBindings(bindings: Record<string, Json>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => {
		if (typeof value === "string") {
			return {
				name,
				text: value,
			};
		} else {
			return {
				name,
				json: JSON.stringify(value),
			};
		}
	});
}

const WRAPPED_MODULE_PREFIX = "miniflare-internal:wrapped:";
function workerNameToWrappedModule(workerName: string): string {
	return WRAPPED_MODULE_PREFIX + workerName;
}
export function maybeWrappedModuleToWorkerName(
	name: string
): string | undefined {
	if (name.startsWith(WRAPPED_MODULE_PREFIX)) {
		return name.substring(WRAPPED_MODULE_PREFIX.length);
	}
}

function getStripCfConnectingIpName(workerIndex: number) {
	return `strip-cf-connecting-ip:${workerIndex}`;
}

function getGlobalOutbound(
	workerIndex: number,
	options: z.infer<typeof CORE_PLUGIN.options>
) {
	return options.outboundService === undefined
		? undefined
		: getCustomServiceDesignator(
				/* referrer */ options.name,
				workerIndex,
				CustomServiceKind.KNOWN,
				CUSTOM_SERVICE_KNOWN_OUTBOUND,
				options.outboundService,
				options.hasAssetsAndIsVitest
			);
}

export const CORE_PLUGIN: Plugin<
	typeof CoreOptionsSchema,
	typeof CoreSharedOptionsSchema
> = {
	options: CoreOptionsSchema,
	sharedOptions: CoreSharedOptionsSchema,
	getBindings(options, workerIndex) {
		const bindings: Awaitable<Worker_Binding>[] = [];

		if (options.bindings !== undefined) {
			bindings.push(...buildBindings(options.bindings));
		}
		if (options.wasmBindings !== undefined) {
			bindings.push(
				...Object.entries(options.wasmBindings).map(([name, value]) =>
					typeof value === "string"
						? fs.readFile(value).then((wasmModule) => ({ name, wasmModule }))
						: { name, wasmModule: value }
				)
			);
		}
		if (options.textBlobBindings !== undefined) {
			bindings.push(
				...Object.entries(options.textBlobBindings).map(([name, path]) =>
					fs.readFile(path, "utf8").then((text) => ({ name, text }))
				)
			);
		}
		if (options.dataBlobBindings !== undefined) {
			bindings.push(
				...Object.entries(options.dataBlobBindings).map(([name, value]) =>
					typeof value === "string"
						? fs.readFile(value).then((data) => ({ name, data }))
						: { name, data: value }
				)
			);
		}
		if (options.serviceBindings !== undefined) {
			bindings.push(
				...Object.entries(options.serviceBindings).map(([name, service]) => {
					return {
						name,
						service: getCustomServiceDesignator(
							/* referrer */ options.name,
							workerIndex,
							CustomServiceKind.UNKNOWN,
							name,
							service,
							options.hasAssetsAndIsVitest
						),
					};
				})
			);
		}
		if (options.wrappedBindings !== undefined) {
			bindings.push(
				...Object.entries(options.wrappedBindings).map(([name, designator]) => {
					// Normalise designator
					const isObject = typeof designator === "object";
					const scriptName = isObject ? designator.scriptName : designator;
					const entrypoint = isObject ? designator.entrypoint : undefined;
					const bindings = isObject ? designator.bindings : undefined;

					// Build binding
					const moduleName = workerNameToWrappedModule(scriptName);
					const innerBindings =
						bindings === undefined ? [] : buildBindings(bindings);
					// `scriptName`'s bindings will be added to `innerBindings` when
					// assembling the config
					return {
						name,
						wrapped: { moduleName, entrypoint, innerBindings },
					};
				})
			);
		}

		if (options.unsafeEvalBinding !== undefined) {
			bindings.push({
				name: options.unsafeEvalBinding,
				unsafeEval: kVoid,
			});
		}

		return Promise.all(bindings);
	},
	async getNodeBindings(options) {
		const bindingEntries: Awaitable<unknown[]>[] = [];

		if (options.bindings !== undefined) {
			bindingEntries.push(
				...Object.entries(options.bindings).map(([name, value]) => [
					name,
					JSON.parse(JSON.stringify(value)),
				])
			);
		}
		if (options.wasmBindings !== undefined) {
			bindingEntries.push(
				...Object.entries(options.wasmBindings).map(([name, value]) =>
					typeof value === "string"
						? fs
								.readFile(value)
								.then((buffer) => [name, new WebAssembly.Module(buffer)])
						: [name, new WebAssembly.Module(value)]
				)
			);
		}
		if (options.textBlobBindings !== undefined) {
			bindingEntries.push(
				...Object.entries(options.textBlobBindings).map(([name, path]) =>
					fs.readFile(path, "utf8").then((text) => [name, text])
				)
			);
		}
		if (options.dataBlobBindings !== undefined) {
			bindingEntries.push(
				...Object.entries(options.dataBlobBindings).map(([name, value]) =>
					typeof value === "string"
						? fs.readFile(value).then((buffer) => [name, viewToBuffer(buffer)])
						: [name, viewToBuffer(value)]
				)
			);
		}
		if (options.serviceBindings !== undefined) {
			bindingEntries.push(
				...Object.keys(options.serviceBindings).map((name) => [
					name,
					new ProxyNodeBinding(),
				])
			);
		}
		if (options.wrappedBindings !== undefined) {
			bindingEntries.push(
				...Object.keys(options.wrappedBindings).map((name) => [
					name,
					new ProxyNodeBinding(),
				])
			);
		}

		return Object.fromEntries(await Promise.all(bindingEntries));
	},
	async getServices({
		log,
		options,
		sharedOptions,
		workerBindings,
		workerIndex,
		wrappedBindingNames,
		durableObjectClassNames,
		additionalModules,
		loopbackPort,
	}) {
		// Define regular user worker
		const additionalModuleNames = additionalModules.map(({ name }) => name);
		const workerScript = getWorkerScript(
			options,
			workerIndex,
			additionalModuleNames
		);
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

		const name = options.name ?? "";
		const serviceName = getUserServiceName(options.name);
		const classNames = durableObjectClassNames.get(serviceName);
		const classNamesEntries = Array.from(classNames ?? []);

		const compatibilityDate = validateCompatibilityDate(
			log,
			options.compatibilityDate ?? FALLBACK_COMPATIBILITY_DATE
		);

		const isWrappedBinding = wrappedBindingNames.has(name);

		const services: Service[] = [];
		const extensions: Extension[] = [];

		if (isWrappedBinding) {
			const stringName = JSON.stringify(name);
			function invalidWrapped(reason: string): never {
				const message = `Cannot use ${stringName} for wrapped binding because ${reason}`;
				throw new MiniflareCoreError("ERR_INVALID_WRAPPED", message);
			}
			if (workerIndex === 0) {
				invalidWrapped(
					`it's the entrypoint.\nEnsure ${stringName} isn't the first entry in the \`workers\` array.`
				);
			}
			if (!("modules" in workerScript)) {
				invalidWrapped(
					`it's a service worker.\nEnsure ${stringName} sets \`modules\` to \`true\` or an array of modules`
				);
			}
			if (workerScript.modules.length !== 1) {
				invalidWrapped(
					`it isn't a single module.\nEnsure ${stringName} doesn't include unbundled \`import\`s.`
				);
			}
			const firstModule = workerScript.modules[0];
			if (!("esModule" in firstModule)) {
				invalidWrapped("it isn't a single ES module");
			}
			if (options.compatibilityDate !== undefined) {
				invalidWrapped(
					"it defines a compatibility date.\nWrapped bindings use the compatibility date of the worker with the binding."
				);
			}
			if (options.compatibilityFlags?.length) {
				invalidWrapped(
					"it defines compatibility flags.\nWrapped bindings use the compatibility flags of the worker with the binding."
				);
			}
			if (options.outboundService !== undefined) {
				invalidWrapped(
					"it defines an outbound service.\nWrapped bindings use the outbound service of the worker with the binding."
				);
			}
			// We validate this "worker" isn't bound to for services/Durable Objects
			// in `getWrappedBindingNames()`.

			extensions.push({
				modules: [
					{
						name: workerNameToWrappedModule(name),
						esModule: firstModule.esModule,
						internal: true,
					},
				],
			});
		} else {
			services.push({
				name: serviceName,
				worker: {
					...workerScript,
					compatibilityDate,
					compatibilityFlags: options.compatibilityFlags,
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
							]) =>
								unsafeUniqueKey === kUnsafeEphemeralUniqueKey
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
											// This `uniqueKey` will (among other things) be used as part of the
											// path when persisting to the file-system. `-` is invalid in
											// JavaScript class names, but safe on filesystems (incl. Windows).
											uniqueKey:
												unsafeUniqueKey ?? `${options.name ?? ""}-${className}`,
											preventEviction,
											container,
										}
						),
					durableObjectStorage:
						classNamesEntries.length === 0
							? undefined
							: options.unsafeEphemeralDurableObjects
								? { inMemory: kVoid }
								: { localDisk: DURABLE_OBJECTS_STORAGE_SERVICE_NAME },
					globalOutbound: options.stripCfConnectingIp
						? { name: getStripCfConnectingIpName(workerIndex) }
						: getGlobalOutbound(workerIndex, options),
					cacheApiOutbound: { name: getCacheServiceName(workerIndex) },
					moduleFallback:
						options.unsafeUseModuleFallbackService &&
						sharedOptions.unsafeModuleFallbackService !== undefined
							? `localhost:${loopbackPort}`
							: undefined,
					tails: options.tails?.map<ServiceDesignator>((service) => {
						return getCustomServiceDesignator(
							/* referrer */ options.name,
							workerIndex,
							CustomServiceKind.UNKNOWN,
							name,
							service,
							options.hasAssetsAndIsVitest
						);
					}),
					streamingTails: options.streamingTails?.map<ServiceDesignator>(
						(service) => {
							return getCustomServiceDesignator(
								/* referrer */ options.name,
								workerIndex,
								CustomServiceKind.UNKNOWN,
								name,
								service,
								options.hasAssetsAndIsVitest
							);
						}
					),
					containerEngine: getContainerEngine(options.containerEngine),
				},
			});
		}

		// Define custom `fetch` services if set
		if (options.serviceBindings !== undefined) {
			for (const [name, service] of Object.entries(options.serviceBindings)) {
				const maybeService = maybeGetCustomServiceService(
					workerIndex,
					CustomServiceKind.UNKNOWN,
					name,
					service
				);
				if (maybeService !== undefined) services.push(maybeService);
			}
		}

		for (const service of options.tails ?? []) {
			const maybeService = maybeGetCustomServiceService(
				workerIndex,
				CustomServiceKind.UNKNOWN,
				name,
				service
			);
			if (maybeService !== undefined) services.push(maybeService);
		}

		for (const service of options.streamingTails ?? []) {
			const maybeService = maybeGetCustomServiceService(
				workerIndex,
				CustomServiceKind.UNKNOWN,
				name,
				service
			);
			if (maybeService !== undefined) services.push(maybeService);
		}

		if (options.outboundService !== undefined) {
			const maybeService = maybeGetCustomServiceService(
				workerIndex,
				CustomServiceKind.KNOWN,
				CUSTOM_SERVICE_KNOWN_OUTBOUND,
				options.outboundService
			);
			if (maybeService !== undefined) services.push(maybeService);
		}

		if (options.stripCfConnectingIp) {
			services.push({
				name: getStripCfConnectingIpName(workerIndex),
				worker: {
					modules: [
						{
							name: "index.js",
							esModule: STRIP_CF_CONNECTING_IP(),
						},
					],
					compatibilityDate: "2025-01-01",
					compatibilityFlags: ["connect_pass_through", "experimental"],
					globalOutbound: getGlobalOutbound(workerIndex, options),
				},
			});
		}

		return { services, extensions };
	},
};

export interface GlobalServicesOptions {
	sharedOptions: z.infer<typeof CoreSharedOptionsSchema>;
	allWorkerRoutes: Map<string, string[]>;
	fallbackWorkerName: string | undefined;
	loopbackPort: number;
	log: Log;
	/** All user workerd-native bindings, used for Miniflare's magic proxy and the local explorer worker */
	proxyBindings: Worker_Binding[];
}
export function getGlobalServices({
	sharedOptions,
	allWorkerRoutes,
	fallbackWorkerName,
	loopbackPort,
	log,
	proxyBindings,
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
	];
	if (sharedOptions.unsafeLocalExplorer) {
		serviceEntryBindings.push({
			name: CoreBindings.SERVICE_LOCAL_EXPLORER,
			service: {
				name: SERVICE_LOCAL_EXPLORER,
			},
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
	if (sharedOptions.liveReload) {
		const liveReloadScript = LIVE_RELOAD_SCRIPT_TEMPLATE(loopbackPort);
		serviceEntryBindings.push({
			name: CoreBindings.DATA_LIVE_RELOAD_SCRIPT,
			data: encoder.encode(liveReloadScript),
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

	if (sharedOptions.unsafeLocalExplorer) {
		services.push({
			name: SERVICE_LOCAL_EXPLORER,
			worker: {
				compatibilityDate: "2026-01-01",
				compatibilityFlags: ["nodejs_compat"],
				modules: [
					{
						name: "api.worker.js",
						esModule: SCRIPT_LOCAL_EXPLORER_API(),
					},
				],
				bindings: [...proxyBindings],
			},
		});
	}

	return services;
}

function getWorkerScript(
	options: SourceOptions & {
		compatibilityDate?: string;
		compatibilityFlags?: string[];
	},
	workerIndex: number,
	additionalModuleNames: string[]
): { serviceWorkerScript: string } | { modules: Worker_Module[] } {
	const modulesRoot = path.resolve(
		("modulesRoot" in options ? options.modulesRoot : undefined) ?? ""
	);
	if (Array.isArray(options.modules)) {
		// If `modules` is a manually defined modules array, use that
		return {
			modules: options.modules.map((module) =>
				convertModuleDefinition(modulesRoot, module)
			),
		};
	}

	// Otherwise get code, preferring string `script` over `scriptPath`
	let code;
	if ("script" in options && options.script !== undefined) {
		code = options.script;
	} else if ("scriptPath" in options && options.scriptPath !== undefined) {
		code = readFileSync(options.scriptPath, "utf8");
	} else {
		// If neither `script`, `scriptPath` nor `modules` is defined, this worker
		// doesn't have any code. `SourceOptionsSchema` should've validated against
		// this.
		assert.fail("Unreachable: Workers must have code");
	}

	const scriptPath = options.scriptPath ?? buildStringScriptPath(workerIndex);
	if (options.modules) {
		// If `modules` is `true`, automatically collect modules...
		const locator = new ModuleLocator(
			modulesRoot,
			additionalModuleNames,
			options.modulesRules,
			options.compatibilityDate,
			options.compatibilityFlags
		);
		// If `script` and `scriptPath` are set, resolve modules in `script`
		// against `scriptPath`.
		locator.visitEntrypoint(code, scriptPath);
		return { modules: locator.modules };
	} else {
		// ...otherwise, `modules` will either be `false` or `undefined`, so treat
		// `code` as a service worker
		code = withSourceURL(code, scriptPath);
		return { serviceWorkerScript: code };
	}
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

	if (typeof engineOrSocketPath === "string") {
		return { localDocker: { socketPath: engineOrSocketPath } };
	}

	return engineOrSocketPath;
}

export * from "./errors";
export * from "./proxy";
export * from "./constants";
export * from "./modules";
export * from "./services";
export * from "./node-compat";
