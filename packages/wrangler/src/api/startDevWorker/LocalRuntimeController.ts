import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { Log, LogLevel, Response, Miniflare, Mutex } from "miniflare";
import { withSourceURL } from "../../deployment-bundle/source-url";
import { getLocalPersistencePath } from "../../dev/get-local-persistence-path";
import { logger } from "../../logger";
import { updateCheck } from "../../update-check";
import { RuntimeController } from "./BaseController";
import { castErrorCause } from "./events";
import type { LoggerLevel } from "../../logger";
import type {
	BundleCompleteEvent,
	BundleStartEvent,
	PreviewTokenExpiredEvent,
	ReloadCompleteEvent,
	ReloadStartEvent,
} from "./events";
import type {
	Binding,
	ServiceDesignator,
	StartDevWorkerOptions,
	Bundle,
	File,
} from "./types";
import type {
	MiniflareOptions,
	SourceOptions,
	WorkerOptions,
	SharedOptions,
} from "miniflare";

const warnOnceMessages = new Set<string>();
function warnOnce(message: string) {
	if (warnOnceMessages.has(message)) return;
	warnOnceMessages.add(message);
	logger.warn(message);
}

function getBinaryFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (file.contents instanceof Buffer) return file.contents;
		return Buffer.from(file.contents);
	}
	return fs.readFileSync(file.path);
}
function getTextFileContents(file: File<string | Uint8Array>) {
	if ("contents" in file) {
		if (typeof file.contents === "string") return file.contents;
		if (file.contents instanceof Buffer) return file.contents.toString();
		return Buffer.from(file.contents).toString();
	}
	return fs.readFileSync(file.path, "utf8");
}

// This worker proxies all external Durable Objects to the Wrangler session
// where they're defined, and receives all requests from other Wrangler sessions
// for this session's Durable Objects. Note the original request URL may contain
// non-standard protocols, so we store it in a header to restore later.
const EXTERNAL_DURABLE_OBJECTS_WORKER_NAME =
	"__WRANGLER_EXTERNAL_DURABLE_OBJECTS_WORKER";
const EXTERNAL_DURABLE_OBJECTS_GET_REGISTERED_WORKER =
	"__EXTERNAL_DURABLE_OBJECTS_GET_REGISTERED_WORKER";
const EXTERNAL_DURABLE_OBJECTS_CONTROL_HEADER = "Wrangler-MF-Durable-Object";
const EXTERNAL_DURABLE_OBJECTS_WORKER_SCRIPT = `
function createClass({ scriptName, className }) {
	return class {
		constructor(state, env) {
			this.id = state.id.toString();
			this.env = env;
		}
		fetch(request) {
			const control = {
				scriptName,
				className,
				id: this.id,
				url: request.url,
				// Ensure exact headers and cf object forwarded to Durable Object
				headers: Array.from(request.headers.entries()),
				cf: request.cf,
			};
			// TODO(someday): fix this for GET requests with bodies. This is a restriction of the Fetch API that workerd has
			//  workarounds for, but undici doesn't. See https://github.com/cloudflare/workerd/issues/1122 for more details.
			//  If we wanted to support this, we'd likely need to use undici's dispatch() or Node's http module directly when
			//  making requests to other dev sessions.
			return this.env.${EXTERNAL_DURABLE_OBJECTS_GET_REGISTERED_WORKER}.fetch("http://placeholder/${EXTERNAL_DURABLE_OBJECTS_WORKER_NAME}", {
				method: request.method,
				headers: { "${EXTERNAL_DURABLE_OBJECTS_CONTROL_HEADER}": JSON.stringify(control) },
				body: request.body,
			});
		}
	}
}

export default {
	fetch(request, env) {
		const controlHeader = request.headers.get("${EXTERNAL_DURABLE_OBJECTS_CONTROL_HEADER}");
		if (controlHeader === null) {
			return new Response("[wrangler] Received Durable Object proxy request missing control information. Ensure all your dev sessions are using the same version of Wrangler.", { status: 400 });
		}
		const { scriptName, className, id, url, headers, cf } = JSON.parse(controlHeader);
		request = new Request(url, {
			method: request.method,
			headers,
			cf,
			body: request.body,
		});
		const ns = env[className];
		if (ns === undefined) {
			return new Response(\`[wrangler] Couldn't find class "\${className}" in service "\${scriptName}" to proxy to\`, { status: 503 });
		}
		const idObject = ns.idFromString(id);
		const stub = ns.get(idObject);
		return stub.fetch(request);
	}
}
`;

class WranglerLog extends Log {
	#warnedCompatibilityDateFallback = false;

	log(message: string) {
		// Hide request logs for external Durable Objects proxy worker
		if (message.includes(EXTERNAL_DURABLE_OBJECTS_WORKER_NAME)) return;
		super.log(message);
	}

	warn(message: string) {
		// Only log warning about requesting a compatibility date after the workerd
		// binary's version once, and only if there's an update available.
		if (message.startsWith("The latest compatibility date supported by")) {
			if (this.#warnedCompatibilityDateFallback) return;
			this.#warnedCompatibilityDateFallback = true;
			return void updateCheck().then((maybeNewVersion) => {
				if (maybeNewVersion === undefined) return;
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

	// TODO(soon): remove this override when miniflare is fixed:
	//  https://jira.cfdata.org/browse/DEVX-983
	error(message: Error) {
		try {
			super.error(message);
		} catch {
			// Miniflare shouldn't throw in `Log#error()`. For now, ignore errors.
		}
	}
}

export const DEFAULT_WORKER_NAME = "worker";
function getName(config: StartDevWorkerOptions) {
	return config.name ?? DEFAULT_WORKER_NAME;
}
const IDENTIFIER_UNSAFE_REGEXP = /[^a-zA-Z0-9_$]/g;
function getIdentifier(name: string) {
	return name.replace(IDENTIFIER_UNSAFE_REGEXP, "_");
}

function castLogLevel(level: LoggerLevel): LogLevel {
	let key = level.toUpperCase() as Uppercase<LoggerLevel>;
	if (key === "LOG") key = "INFO";
	return LogLevel[key];
}

function buildLog(): Log {
	let level = castLogLevel(logger.loggerLevel);
	// Clamp log level to WARN, so we don't show request logs for user worker
	level = Math.min(level, LogLevel.WARN);
	return new WranglerLog(level, { prefix: "wrangler-UserWorker" });
}

function buildSourceOptions(bundle: Bundle): SourceOptions {
	if (bundle.type === "service-worker") {
		// Miniflare will handle adding `//# sourceURL` comments if they're missing
		const script = getTextFileContents(bundle.serviceWorker);
		return { script, scriptPath: bundle.serviceWorker.path };
	} else {
		const modulesRoot = path.dirname(bundle.modules[0].name);
		type Module = Extract<SourceOptions["modules"], unknown[]>[number];
		const modules = bundle.modules.map((module) => {
			let contents: string | Uint8Array | undefined;
			if (
				module.type === "ESModule" ||
				module.type === "CommonJS" ||
				module.type === "NodeJsCompatModule"
			) {
				contents = getTextFileContents(module);
				if (module.path !== undefined) {
					contents = withSourceURL(contents, module.path);
				}
			} else {
				contents = getBinaryFileContents(module);
			}
			return <Module>{
				type: module.type,
				path: path.resolve(modulesRoot, module.name),
				contents,
			};
		});
		return { modulesRoot, modules };
	}
}

function isUnsafeBindingType(type: string): type is `unsafe-${string}` {
	return type.startsWith("unsafe-");
}
function buildBindingOptions(event: BundleCompleteEvent) {
	const jsonBindings: NonNullable<WorkerOptions["bindings"]> = {};
	const textBlobBindings: NonNullable<WorkerOptions["textBlobBindings"]> = {};
	const dataBlobBindings: NonNullable<WorkerOptions["dataBlobBindings"]> = {};
	const wasmBindings: NonNullable<WorkerOptions["wasmBindings"]> = {};
	const kvNamespaces: NonNullable<WorkerOptions["kvNamespaces"]> = {};
	const r2Buckets: NonNullable<WorkerOptions["r2Buckets"]> = {};
	const d1Databases: NonNullable<WorkerOptions["d1Databases"]> = {};
	const queueProducers: NonNullable<WorkerOptions["queueProducers"]> = {};
	const hyperdrives: NonNullable<WorkerOptions["hyperdrives"]> = {};
	const serviceBindings: NonNullable<WorkerOptions["serviceBindings"]> = {};

	type DurableObjectBinding = {
		name: string;
		binding: Extract<Binding, { type: "durable-object" }>;
	};
	const internalObjects: DurableObjectBinding[] = [];
	const externalObjects: (DurableObjectBinding & {
		binding: { service: ServiceDesignator }; // External so must have a service
	})[] = [];

	const bindings = event.config.bindings;
	const getRegisteredWorker = event.config.dev?.getRegisteredWorker;
	for (const [name, binding] of Object.entries(bindings ?? {})) {
		if (binding.type === "kv") {
			kvNamespaces[name] = binding.id;
		} else if (binding.type === "r2") {
			r2Buckets[name] = binding.bucket_name;
		} else if (binding.type === "d1") {
			d1Databases[name] = binding.preview_database_id ?? binding.database_id;
		} else if (binding.type === "durable-object") {
			// Partition Durable Objects based on whether they're internal (defined by
			// this session's worker), or external (defined by another session's
			// worker registered in the dev registry)
			const internal =
				binding.service === undefined ||
				binding.service.name === event.config.name;
			(internal ? internalObjects : externalObjects).push({ name, binding });
		} else if (binding.type === "service") {
			if (typeof binding.service === "function") {
				serviceBindings[name] = binding.service;
			} else if (binding.service.name === event.config.name) {
				serviceBindings[name] = binding.service.name;
			} else {
				const serviceName = binding.service.name;
				serviceBindings[name] = (request) => {
					const registeredFetch = getRegisteredWorker?.(serviceName);
					if (registeredFetch !== undefined) return registeredFetch(request);
					return new Response(
						`[wrangler] Couldn't find \`wrangler dev\` session for service "${serviceName}" to proxy to\``,
						{ status: 503 }
					);
				};
			}
		} else if (binding.type === "queue-producer") {
			queueProducers[name] = binding.name;
		} else if (binding.type === "constellation") {
			warnOnce(
				"Miniflare does not support Constellation bindings yet, ignoring..."
			);
		} else if (binding.type === "var") {
			if (binding.value instanceof Uint8Array) {
				dataBlobBindings[name] = binding.value;
			} else {
				jsonBindings[name] = binding.value;
			}
		} else if (binding.type === "wasm-module") {
			wasmBindings[name] = getBinaryFileContents(binding.source);
		} else if (binding.type === "hyperdrive") {
			if (binding.localConnectionString !== undefined) {
				hyperdrives[name] = binding.localConnectionString;
			}
		} else if (isUnsafeBindingType(binding.type)) {
			warnOnce("Miniflare does not support unsafe bindings, ignoring...");
		} else {
			const _exhaustive: never = binding.type;
		}
	}

	// Setup blob and module bindings
	if (event.bundle.type === "service-worker") {
		// For the service-worker format, blobs are accessible on the global scope
		for (const module of event.bundle.modules ?? []) {
			const identifier = getIdentifier(module.name);
			if (module.type === "Text") {
				jsonBindings[identifier] = getTextFileContents(module);
			} else if (module.type === "Data") {
				dataBlobBindings[identifier] = getBinaryFileContents(module);
			} else if (module.type === "CompiledWasm") {
				wasmBindings[identifier] = getBinaryFileContents(module);
			}
		}
	}

	// Setup Durable Object bindings and proxy worker
	const externalDurableObjectWorker: WorkerOptions = {
		name: EXTERNAL_DURABLE_OBJECTS_WORKER_NAME,
		// Bind all internal objects, so they're accessible by all other sessions
		// that proxy requests for our objects to this worker
		durableObjects: Object.fromEntries(
			internalObjects.map(({ binding }) => [
				binding.className,
				{ className: binding.className, scriptName: getName(event.config) },
			])
		),
		// Setup service binding for Durable Objects to call `getRegisteredWorker()`
		serviceBindings: {
			[EXTERNAL_DURABLE_OBJECTS_GET_REGISTERED_WORKER](request) {
				const controlHeader = request.headers.get(
					EXTERNAL_DURABLE_OBJECTS_CONTROL_HEADER
				);
				assert(controlHeader !== null);
				const { scriptName } = JSON.parse(controlHeader);
				const registeredFetch = getRegisteredWorker?.(scriptName);
				if (registeredFetch !== undefined) return registeredFetch(request);
				return new Response(
					`[wrangler] Couldn't find \`wrangler dev\` session for service "${scriptName}" to proxy to\``,
					{ status: 503 }
				);
			},
		},
		// Use this worker instead of the user worker if the pathname is
		// `/${EXTERNAL_DURABLE_OBJECTS_WORKER_NAME}`
		// TODO(soon): consider using `/cdn-cgi/...` path here, if we switched,
		//  we'd lose compatibility with other Wrangler 3 versions
		routes: [`*/${EXTERNAL_DURABLE_OBJECTS_WORKER_NAME}`],
		// Use in-memory storage for the stub object classes *declared* by this
		// script. They don't need to persist anything, and would end up using the
		// incorrect unsafe unique key.
		unsafeEphemeralDurableObjects: true,
		// Make sure we use the provided `cf` object as is
		compatibilityFlags: ["no_cf_botmanagement_default"],
		modules: true,
		script:
			EXTERNAL_DURABLE_OBJECTS_WORKER_SCRIPT +
			// Add stub object classes that proxy requests to the correct session
			externalObjects
				.map(({ binding }) => {
					const identifier = getIdentifier(
						`${binding.service.name}_${binding.className}`
					);
					const scriptNameJson = JSON.stringify(binding.service.name);
					const classNameJson = JSON.stringify(binding.className);
					return `export const ${identifier} = createClass({ scriptName: ${scriptNameJson}, className: ${classNameJson} });`;
				})
				.join("\n"),
	};

	const bindingOptions = {
		bindings: jsonBindings,
		textBlobBindings,
		dataBlobBindings,
		wasmBindings,

		kvNamespaces,
		r2Buckets,
		d1Databases,
		queueProducers,
		hyperdrives,

		serviceBindings,
		durableObjects: Object.fromEntries([
			...internalObjects.map(({ name, binding }) => [name, binding.className]),
			...externalObjects.map(({ name, binding }) => {
				const identifier = getIdentifier(
					`${binding.service.name}_${binding.className}`
				);
				return [
					name,
					{
						className: identifier,
						scriptName: EXTERNAL_DURABLE_OBJECTS_WORKER_NAME,
						// Matches the unique key Miniflare will generate for this object in
						// the target session. We need to do this so workerd generates the
						// same IDs it would if this were part of the same process. workerd
						// doesn't allow IDs from Durable Objects with different unique keys
						// to be used with each other.
						unsafeUniqueKey: `${binding.service.name}-${binding.className}`,
					},
				];
			}),
		]),
	};

	return { bindingOptions, externalDurableObjectWorker };
}

function buildTriggerOptions(config: StartDevWorkerOptions) {
	const queueConsumers: NonNullable<WorkerOptions["queueConsumers"]> = {};
	for (const trigger of config.triggers ?? []) {
		if (trigger.type === "workers.dev" || trigger.type === "route") {
			// Ignore HTTP triggers, we just handle any HTTP request
		} else if (trigger.type === "schedule") {
			warnOnce("Miniflare does not support CRON triggers yet, ignoring...");
		} else if (trigger.type === "queue-consumer") {
			queueConsumers[trigger.name] = {
				maxBatchSize: trigger.maxBatchSize,
				maxBatchTimeout: trigger.maxBatchTimeout,
				maxRetries: trigger.maxRetries,
				deadLetterQueue: trigger.deadLetterQueue,
			};
		} else {
			const _exhaustive: never = trigger;
		}
	}
	return { queueConsumers };
}

type PickTemplate<T, K extends string> = {
	[P in keyof T & K]: T[P];
};
type PersistOptions = Required<PickTemplate<SharedOptions, `${string}Persist`>>;
function buildPersistOptions(
	config: StartDevWorkerOptions
): PersistOptions | undefined {
	const persist = config.dev?.persist ?? false;
	if (persist === false) return;
	const persistTo = persist === true ? undefined : persist.path;
	const configPath = config.config?.path;
	const localPersistencePath = getLocalPersistencePath(persistTo, configPath);
	const v3Path = path.join(localPersistencePath, "v3");
	return {
		cachePersist: path.join(v3Path, "cache"),
		durableObjectsPersist: path.join(v3Path, "do"),
		kvPersist: path.join(v3Path, "kv"),
		r2Persist: path.join(v3Path, "r2"),
		d1Persist: path.join(v3Path, "d1"),
	};
}

function buildSitesOptions(config: StartDevWorkerOptions) {
	if (config.site !== undefined) {
		return {
			sitePath: config.site.path,
			siteInclude: config.site.include,
			siteExclude: config.site.exclude,
		};
	}
}

function buildMiniflareOptions(
	log: Log,
	event: BundleCompleteEvent
): MiniflareOptions {
	const sourceOptions = buildSourceOptions(event.bundle);
	const { bindingOptions, externalDurableObjectWorker } =
		buildBindingOptions(event);
	const triggerOptions = buildTriggerOptions(event.config);
	const sitesOptions = buildSitesOptions(event.config);
	const persistOptions = buildPersistOptions(event.config);

	return {
		host: "127.0.0.1",
		inspectorPort: 0,
		// upstream,

		log,
		verbose: logger.loggerLevel === "debug",

		...persistOptions,
		workers: [
			{
				name: getName(event.config),
				compatibilityDate: event.config.compatibilityDate,
				compatibilityFlags: event.config.compatibilityFlags,

				...sourceOptions,
				...bindingOptions,
				...triggerOptions,
				...sitesOptions,
			},
			externalDurableObjectWorker,
		],
	};
}

export class LocalRuntimeController extends RuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	#log = buildLog();
	#currentBundleId = 0;

	#mutex = new Mutex();
	#mf?: Miniflare;

	onBundleStart(_: BundleStartEvent) {
		// Ignored in local runtime
	}

	async #onBundleComplete(data: BundleCompleteEvent, id: number) {
		try {
			const options = buildMiniflareOptions(this.#log, data);
			if (this.#mf === undefined) {
				this.#mf = new Miniflare(options);
			} else {
				await this.#mf.setOptions(options);
			}
			// All asynchronous `Miniflare` methods will wait for all `setOptions()`
			// calls to complete before resolving. To ensure we get the `url` and
			// `inspectorUrl` for this set of `options`, we protect `#mf` with a mutex,
			// so only update can happen at a time.
			const userWorkerUrl = await this.#mf.ready;
			const userWorkerInspectorUrl = await this.#mf.getInspectorURL();
			// If we received a new `bundleComplete` event before we were able to
			// dispatch a `reloadComplete` for this bundle, ignore this bundle.
			if (id !== this.#currentBundleId) return;
			this.emitReloadCompleteEvent({
				type: "reloadComplete",
				config: data.config,
				bundle: data.bundle,
				proxyData: {
					userWorkerUrl: {
						protocol: userWorkerUrl.protocol,
						hostname: userWorkerUrl.hostname,
						port: userWorkerUrl.port,
					},
					userWorkerInspectorUrl: {
						protocol: userWorkerInspectorUrl.protocol,
						hostname: userWorkerInspectorUrl.hostname,
						port: userWorkerInspectorUrl.port,
						pathname: `/core:user:${getName(data.config)}`,
					},
					userWorkerInnerUrlOverrides: {
						protocol: data.config?.dev?.urlOverrides?.secure
							? "https:"
							: "http:",
						hostname: data.config?.dev?.urlOverrides?.hostname,
					},
					headers: {},
					liveReload: data.config.dev?.liveReload,
					proxyLogsToController: data.bundle.type === "service-worker",
				},
			});
		} catch (error) {
			this.emitErrorEvent({
				type: "error",
				reason: "Error reloading local server",
				cause: castErrorCause(error),
				source: "LocalRuntimeController",
			});
		}
	}
	onBundleComplete(data: BundleCompleteEvent) {
		const id = ++this.#currentBundleId;
		this.emitReloadStartEvent({
			type: "reloadStart",
			config: data.config,
			bundle: data.bundle,
		});
		void this.#mutex.runWith(() => this.#onBundleComplete(data, id));
	}
	onPreviewTokenExpired(_: PreviewTokenExpiredEvent): void {
		// Ignored in local runtime
	}

	#teardown = async (): Promise<void> => {
		await this.#mf?.dispose();
		this.#mf = undefined;
	};
	async teardown() {
		return this.#mutex.runWith(this.#teardown);
	}

	// *********************
	//   Event Dispatchers
	// *********************

	emitReloadStartEvent(data: ReloadStartEvent) {
		this.emit("reloadStart", data);
	}
	emitReloadCompleteEvent(data: ReloadCompleteEvent) {
		this.emit("reloadComplete", data);
	}
}
