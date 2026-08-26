import { readFileSync } from "node:fs";
import path from "node:path";
import { kCurrentWorker } from "./current-worker";
import { V4MiniflareOptionsSchema } from "./v4-schema";
import type { RemoteProxyConnectionString } from "../plugins/shared";
import type {
	DevConfig,
	LegacyConfig,
	MiniflareOptions,
	MiniflareWorkerConfig,
	WorkerOptions,
} from "./schema";
import type {
	ParsedV4MiniflareOptions,
	ParsedV4WorkerOptions,
	V4MiniflareOptions,
	V4ModuleRuleType,
} from "./v4-schema";

const FALLBACK_COMPATIBILITY_DATE = "2000-01-01";

type Env = NonNullable<MiniflareWorkerConfig["env"]>;
type Exports = NonNullable<MiniflareWorkerConfig["exports"]>;
type Manifest = NonNullable<MiniflareWorkerConfig["manifest"]>;
type ManifestModule = Manifest["modules"][string];
type Assets = NonNullable<MiniflareWorkerConfig["assets"]>;
type ServiceBinding = Extract<Env[string], { type: "worker" }>;

export function convertV4MiniflareOptions(
	options: V4MiniflareOptions
): MiniflareOptions {
	const parsed = V4MiniflareOptionsSchema.parse(options);
	const sharedRootPath = path.resolve(
		"workers" in parsed ? (parsed.rootPath ?? ".") : "."
	);
	const converted: MiniflareOptions = {
		...convertSharedOptions(parsed),
		workers: getV4Workers(parsed).map((worker, index) =>
			convertWorkerOptions(worker, index, sharedRootPath)
		),
	};

	return converted;
}

function convertSharedOptions(options: ParsedV4MiniflareOptions) {
	return {
		host: options.host,
		port: options.port,
		https: options.https,
		httpsKey: options.httpsKey,
		httpsCert: options.httpsCert,
		inspectorPort: options.inspectorPort,
		inspectorHost: options.inspectorHost,
		verbose: options.verbose,
		log: options.log,
		handleStructuredLogs: options.handleStructuredLogs,
		unsafeHandleRuntimeRestart: options.unsafeHandleRuntimeRestart,
		handleUncaughtError: options.handleUncaughtError,
		upstream: options.upstream,
		cf: options.cf,
		unsafeDevRegistryPath: options.unsafeDevRegistryPath,
		unsafeHandleDevRegistryUpdate: options.unsafeHandleDevRegistryUpdate,
		unsafeProxySharedSecret: options.unsafeProxySharedSecret,
		unsafeModuleFallbackService: options.unsafeModuleFallbackService,
		unsafeTriggerHandlers: options.unsafeTriggerHandlers,
		unsafeRuntimeEnv: options.unsafeRuntimeEnv,
		unsafeLocalExplorer: options.unsafeLocalExplorer,
		unsafeObservability: options.unsafeObservability,
		unsafeInspectDurableObjects: options.unsafeInspectDurableObjects,
		logRequests: options.logRequests,
		resourcePersistencePath: options.resourcePersistencePath,
		isolatedResourcePersistencePath: options.isolatedResourcePersistencePath,
		resourceTmpPath: options.resourceTmpPath,
		stripDisablePrettyError: options.stripDisablePrettyError,
		telemetry: options.telemetry,
		publicUrl: options.publicUrl,
		containerEngine: options.containerEngine,
	} satisfies Omit<MiniflareOptions, "workers">;
}

function getV4Workers(
	options: ParsedV4MiniflareOptions
): ParsedV4WorkerOptions[] {
	if ("workers" in options) {
		return options.workers;
	}
	return [options];
}

function convertWorkerOptions(
	worker: ParsedV4WorkerOptions,
	workerIndex: number,
	sharedRootPath: string
): WorkerOptions {
	const env: Env = {};
	const exports: Exports = {};
	const legacy: LegacyConfig = {};
	const dev: DevConfig = {};
	let remoteProxyConnectionString: RemoteProxyConnectionString | undefined;

	const setRemoteProxyConnectionString = (
		value: RemoteProxyConnectionString | undefined
	) => {
		if (
			remoteProxyConnectionString !== undefined &&
			value !== undefined &&
			String(remoteProxyConnectionString) !== String(value)
		) {
			throwUnsupportedOption("multiple remoteProxyConnectionString values");
		}
		if (remoteProxyConnectionString === undefined) {
			remoteProxyConnectionString = value;
		}
	};
	const isRemote = (value: RemoteProxyConnectionString | undefined) => {
		setRemoteProxyConnectionString(value);
		return value !== undefined;
	};

	const optionsRootPath = path.resolve(sharedRootPath, worker.rootPath ?? ".");
	const manifest = addSourceOptions(
		worker,
		workerIndex,
		legacy,
		optionsRootPath
	);

	const config: MiniflareWorkerConfig = {
		type: "worker",
		name: worker.name ?? "",
		compatibilityDate: worker.compatibilityDate ?? FALLBACK_COMPATIBILITY_DATE,
		compatibilityFlags: worker.compatibilityFlags,
		manifest,
		env,
		exports,
	};

	for (const route of worker.routes ?? []) {
		config.triggers ??= [];
		config.triggers.push({ type: "fetch", pattern: route });
	}

	for (const connectHandler of worker.connectHandlers ?? []) {
		config.triggers ??= [];
		config.triggers.push({ type: "connect", ...connectHandler });
	}

	addVariableBindings(env, worker.bindings);
	addNamespaceBindings(env, "kv", worker.kvNamespaces, isRemote);
	addNamespaceBindings(env, "d1", worker.d1Databases, isRemote);
	addR2Bindings(env, worker.r2Buckets, isRemote);
	addDurableObjectBindings(env, exports, config.name, worker, isRemote);
	addQueueBindings(
		env,
		config,
		worker.queueProducers,
		worker.queueConsumers,
		isRemote
	);
	addServiceBindings(env, worker.serviceBindings, isRemote);
	addServiceBindingArray(config, worker.tails, false);
	addServiceBindingArray(config, worker.streamingTails, true);
	addProductBindings(env, exports, config, worker, isRemote);

	legacy.wasmBindings = worker.wasmBindings;
	legacy.textBlobBindings = worker.textBlobBindings;
	legacy.dataBlobBindings = worker.dataBlobBindings;
	legacy.sitePath =
		worker.sitePath === undefined
			? undefined
			: path.resolve(optionsRootPath, worker.sitePath);
	legacy.siteInclude = worker.siteInclude;
	legacy.siteExclude = worker.siteExclude;

	dev.rootPath = optionsRootPath;
	dev.cacheAPI = worker.cacheAPI;
	dev.outboundService = convertOutboundService(
		worker.outboundService,
		isRemote
	);
	dev.remoteProxyConnectionString = remoteProxyConnectionString;
	dev.unsafeInspectorProxy = worker.unsafeInspectorProxy;
	dev.unsafeDirectSockets = worker.unsafeDirectSockets;
	dev.unsafeOverrideFetchWorker = worker.unsafeOverrideFetchWorker;
	dev.unsafeEvalBinding = worker.unsafeEvalBinding;
	dev.useModuleFallbackService = worker.unsafeUseModuleFallbackService;
	dev.unsafeRegisterWorker = worker.unsafeRegisterWorker ?? true;
	dev.unsafeEphemeralDurableObjects = worker.unsafeEphemeralDurableObjects;
	dev.stripCfConnectingIp = worker.stripCfConnectingIp;
	dev.zone = worker.zone;
	dev.access = worker.access;

	const options: WorkerOptions = { config };
	if (Object.values(legacy).some((value) => value !== undefined)) {
		options.legacy = legacy;
	}
	if (Object.values(dev).some((value) => value !== undefined)) {
		options.dev = dev;
	}
	return options;
}

function addSourceOptions(
	worker: ParsedV4WorkerOptions,
	workerIndex: number,
	legacy: LegacyConfig,
	rootPath: string
): Manifest | undefined {
	if ("modulesRules" in worker && worker.modulesRules !== undefined) {
		throwUnsupportedOption("modulesRules");
	}
	if (Array.isArray(worker.modules)) {
		const modulesRoot = path.resolve(rootPath, worker.modulesRoot ?? ".");
		return createManifestFromModules(worker.modules, rootPath, modulesRoot);
	}

	const scriptPath =
		"scriptPath" in worker && worker.scriptPath !== undefined
			? path.resolve(rootPath, worker.scriptPath)
			: undefined;
	const script =
		"script" in worker
			? worker.script
			: scriptPath !== undefined
				? readFileSync(scriptPath, "utf8")
				: undefined;
	if (script === undefined) {
		throw new TypeError("V4 Miniflare workers must define a script.");
	}

	if (worker.modules === true) {
		const modulesRoot = path.resolve(rootPath, worker.modulesRoot ?? ".");
		const mainModule =
			scriptPath !== undefined
				? getModuleName(scriptPath, modulesRoot)
				: `script-${workerIndex}.mjs`;
		return {
			mainModule,
			modulesRoot,
			modules: {
				[mainModule]: { type: "esm", contents: script },
			},
		};
	} else {
		legacy.serviceWorkerScript = script;
		if (scriptPath !== undefined) {
			legacy.serviceWorkerScriptPath = scriptPath;
		}
	}
}

function createManifestFromModules(
	modules: Extract<ParsedV4WorkerOptions["modules"], unknown[]>,
	rootPath: string,
	modulesRoot: string
): Manifest {
	const manifestModules: Manifest["modules"] = {};
	let mainModule: string | undefined;

	for (const module of modules) {
		const modulePath = path.isAbsolute(module.path)
			? module.path
			: path.resolve(rootPath, module.path);
		const name = getModuleName(modulePath, modulesRoot);
		mainModule ??= name;
		manifestModules[name] = {
			type: convertModuleType(module.type),
			contents: module.contents ?? readModuleContents(modulePath, module.type),
		};
	}

	if (mainModule === undefined) {
		throw new TypeError(
			"V4 Miniflare module workers must define at least one module."
		);
	}

	return { mainModule, modulesRoot, modules: manifestModules };
}

function getModuleName(modulePath: string, modulesRoot: string) {
	if (path.isAbsolute(modulePath)) {
		return path
			.relative(modulesRoot, modulePath)
			.split(path.sep)
			.join(path.posix.sep);
	}
	return modulePath.split(path.sep).join(path.posix.sep);
}

function readModuleContents(
	modulePath: string,
	type: V4ModuleRuleType
): ManifestModule["contents"] {
	if (type === "Data" || type === "CompiledWasm") {
		return toUint8Array(readFileSync(modulePath));
	}
	return readFileSync(modulePath, "utf8");
}

function toUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
	const copy = new Uint8Array(buffer.byteLength);
	copy.set(buffer);
	return copy;
}

function convertModuleType(type: V4ModuleRuleType): ManifestModule["type"] {
	switch (type) {
		case "ESModule":
			return "esm";
		case "CommonJS":
			return "cjs";
		case "Text":
			return "text";
		case "Data":
			return "data";
		case "CompiledWasm":
			return "wasm";
		case "PythonModule":
			return "python";
		case "PythonRequirement":
			return "python-requirement";
	}
}

function addVariableBindings(
	env: Env,
	bindings: ParsedV4WorkerOptions["bindings"]
) {
	for (const [name, value] of Object.entries(bindings ?? {})) {
		env[name] =
			typeof value === "string"
				? { type: "text", value }
				: { type: "json", value };
	}
}

function addNamespaceBindings(
	env: Env,
	type: "kv" | "d1",
	namespaces:
		| ParsedV4WorkerOptions["kvNamespaces"]
		| ParsedV4WorkerOptions["d1Databases"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	if (namespaces === undefined) {
		return;
	}
	if (Array.isArray(namespaces)) {
		for (const name of namespaces) {
			env[name] = { type, id: name };
		}
		return;
	}
	for (const [name, value] of Object.entries(namespaces)) {
		if (typeof value === "string") {
			env[name] = { type, id: value };
		} else {
			env[name] = {
				type,
				id: value.id,
				dev: { remote: isRemote(value.remoteProxyConnectionString) },
			};
		}
	}
}

function addR2Bindings(
	env: Env,
	buckets: ParsedV4WorkerOptions["r2Buckets"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	if (buckets === undefined) {
		return;
	}
	if (Array.isArray(buckets)) {
		for (const name of buckets) {
			env[name] = { type: "r2", name };
		}
		return;
	}
	for (const [bindingName, bucket] of Object.entries(buckets)) {
		if (typeof bucket === "string") {
			env[bindingName] = { type: "r2", name: bucket };
		} else {
			env[bindingName] = {
				type: "r2",
				name: bucket.id,
				dev: {
					remote: isRemote(bucket.remoteProxyConnectionString),
					experimentalS3Credentials: bucket.s3Credentials,
				},
			};
		}
	}
}

function addDurableObjectBindings(
	env: Env,
	exports: Exports,
	workerName: string,
	worker: ParsedV4WorkerOptions,
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	for (const [bindingName, object] of Object.entries(
		worker.durableObjects ?? {}
	)) {
		const objectOptions =
			typeof object === "string" ? { className: object } : object;
		const targetWorkerName = objectOptions.scriptName ?? workerName;
		env[bindingName] = {
			type: "durable-object",
			workerName: targetWorkerName,
			exportName: objectOptions.className,
		};
		isRemote(objectOptions.remoteProxyConnectionString);

		if (targetWorkerName === workerName) {
			addDurableObjectExport(exports, objectOptions);
		}
	}

	for (const object of worker.additionalUnboundDurableObjects ?? []) {
		addDurableObjectExport(exports, object);
		isRemote(object.remoteProxyConnectionString);
	}
}

function addDurableObjectExport(
	exports: Exports,
	object: Exclude<
		NonNullable<
			ParsedV4WorkerOptions["additionalUnboundDurableObjects"]
		>[number],
		string
	>
) {
	const exported = {
		type: "durable-object",
		storage: object.useSQLite ? "sqlite" : "legacy-kv",
		unsafeUniqueKey: object.unsafeUniqueKey,
		unsafePreventEviction: object.unsafePreventEviction,
		container: object.container,
	};
	exports[object.className] = exported as Exports[string];
}

function addQueueBindings(
	env: Env,
	config: MiniflareWorkerConfig,
	producers: ParsedV4WorkerOptions["queueProducers"],
	consumers: ParsedV4WorkerOptions["queueConsumers"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	if (Array.isArray(producers)) {
		for (const name of producers) {
			env[name] = { type: "queue", name };
		}
	} else {
		for (const [bindingName, producer] of Object.entries(producers ?? {})) {
			if (typeof producer === "string") {
				env[bindingName] = { type: "queue", name: producer };
			} else {
				env[bindingName] = {
					type: "queue",
					name: producer.queueName,
					deliveryDelay: producer.deliveryDelay,
					dev: {
						remote: isRemote(producer.remoteProxyConnectionString),
					},
				};
			}
		}
	}

	if (Array.isArray(consumers)) {
		for (const name of consumers) {
			config.triggers ??= [];
			config.triggers.push({ type: "queue", name });
		}
	} else {
		for (const [name, consumer] of Object.entries(consumers ?? {})) {
			config.triggers ??= [];
			config.triggers.push({
				type: "queue",
				name,
				deadLetterQueue: consumer.deadLetterQueue,
				maxBatchSize: consumer.maxBatchSize,
				maxBatchTimeout: consumer.maxBatchTimeout,
				maxRetries: consumer.maxRetries,
				retryDelay: consumer.retryDelay,
			});
		}
	}
}

function addServiceBindings(
	env: Env,
	serviceBindings: ParsedV4WorkerOptions["serviceBindings"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	for (const [name, binding] of Object.entries(serviceBindings ?? {})) {
		env[name] = convertServiceDesignator(binding, isRemote);
	}
}

function addServiceBindingArray(
	config: MiniflareWorkerConfig,
	bindings: ParsedV4WorkerOptions["tails"],
	streaming: boolean
) {
	const option = streaming ? "streamingTails" : "tails";
	for (const binding of bindings ?? []) {
		if (hasRemoteProxyConnectionString(binding)) {
			throwUnsupportedOption(`${option}[].remoteProxyConnectionString`);
		}
		const converted = convertServiceDesignator(binding, () => false);
		if (
			converted.type !== "worker" ||
			typeof converted.workerName !== "string"
		) {
			throwUnsupportedOption(option);
		}
		config.tailConsumers ??= [];
		config.tailConsumers.push({
			workerName: converted.workerName,
			entrypoint: converted.exportName,
			props: converted.props,
			streaming,
		});
	}
}

function hasRemoteProxyConnectionString(
	binding: NonNullable<ParsedV4WorkerOptions["tails"]>[number]
) {
	return (
		typeof binding === "object" &&
		binding !== null &&
		"remoteProxyConnectionString" in binding &&
		binding.remoteProxyConnectionString !== undefined
	);
}

function convertOutboundService(
	binding: ParsedV4WorkerOptions["outboundService"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
): DevConfig["outboundService"] {
	if (binding === undefined) {
		return undefined;
	}
	const converted = convertServiceDesignator(binding, isRemote);
	if (converted.type === "fetcher" || converted.type === "node-handler") {
		return converted;
	}
	if (converted.type === "worker" && typeof converted.workerName === "string") {
		return {
			type: "worker",
			workerName: converted.workerName,
			exportName: converted.exportName,
			props: converted.props,
			dev: converted.dev,
		};
	}
	throwUnsupportedOption("outboundService");
}

function convertServiceDesignator(
	binding: NonNullable<ParsedV4WorkerOptions["outboundService"]>,
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
): Env[string] {
	if (typeof binding === "function") {
		return { type: "fetcher", handler: binding };
	}
	if (typeof binding === "string") {
		return { type: "worker", workerName: binding };
	}
	if (binding === kCurrentWorker) {
		return {
			type: "worker",
			workerName: getCurrentWorkerBindingName(),
		};
	}
	if (typeof binding !== "object" || binding === null) {
		return {
			type: "worker",
			workerName: getCurrentWorkerBindingName(),
		};
	}
	if ("name" in binding) {
		return {
			type: "worker",
			workerName: convertWorkerName(binding.name),
			exportName: binding.entrypoint,
			props: binding.props,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	if ("network" in binding) {
		return { type: "network", ...binding.network };
	}
	if ("external" in binding) {
		return { type: "external", ...binding.external };
	}
	if ("disk" in binding) {
		return { type: "disk", ...binding.disk };
	}
	return { type: "node-handler", handler: binding.node };
}

function getCurrentWorkerBindingName(): ServiceBinding["workerName"] {
	return kCurrentWorker;
}

function convertWorkerName(
	name: string | symbol
): ServiceBinding["workerName"] {
	return typeof name === "string" ? name : getCurrentWorkerBindingName();
}

function addProductBindings(
	env: Env,
	exports: Exports,
	config: MiniflareWorkerConfig,
	worker: ParsedV4WorkerOptions,
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	for (const binding of worker.unsafeBindings ?? []) {
		env[binding.name] = {
			type: `unsafe:${binding.type}`,
			dev: { plugin: binding.plugin, options: binding.options },
		};
	}
	if (worker.assets !== undefined) {
		configAssets(env, config, worker);
	}
	if (worker.ai !== undefined) {
		env[worker.ai.binding] = {
			type: "ai",
			dev: { remote: isRemote(worker.ai.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.agentMemory ?? {})) {
		env[name] = {
			type: "agent-memory",
			namespace: binding.namespace,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(
		worker.aiSearchNamespaces ?? {}
	)) {
		env[name] = {
			type: "ai-search-namespace",
			namespace: binding.namespace ?? name,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(
		worker.aiSearchInstances ?? {}
	)) {
		env[name] = {
			type: "ai-search",
			name: binding.instance_name ?? binding.namespace ?? name,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.websearch ?? {})) {
		env[name] = {
			type: "web-search",
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(
		worker.analyticsEngineDatasets ?? {}
	)) {
		env[name] = { type: "analytics-engine-dataset", name: binding.dataset };
	}
	for (const [name, value] of Object.entries(worker.hyperdrives ?? {})) {
		env[name] = {
			type: "hyperdrive",
			id: name,
			dev: { connectionString: String(value) },
		};
	}
	for (const [name, binding] of Object.entries(worker.ratelimits ?? {})) {
		env[name] = {
			type: "rate-limit",
			namespace: binding.namespace_id,
			simple: binding.simple,
		};
	}
	addPipelineBindings(env, worker.pipelines, isRemote);
	for (const binding of worker.email?.send_email ?? []) {
		env[binding.name] = {
			type: "send-email",
			destinationAddress: binding.destination_address,
			allowedDestinationAddresses: binding.allowed_destination_addresses,
			allowedSenderAddresses: binding.allowed_sender_addresses,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(
		worker.secretsStoreSecrets ?? {}
	)) {
		env[name] = {
			type: "secrets-store-secret",
			storeId: binding.store_id,
			secretName: binding.secret_name,
		};
	}
	for (const [name, binding] of Object.entries(worker.vectorize ?? {})) {
		env[name] = {
			type: "vectorize",
			name: binding.index_name,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(
		worker.dispatchNamespaces ?? {}
	)) {
		env[name] = {
			type: "dispatch-namespace",
			namespace: binding.namespace,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.vpcServices ?? {})) {
		env[name] = {
			type: "vpc-service",
			id: binding.service_id,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.vpcNetworks ?? {})) {
		env[name] = {
			type: "vpc-network",
			...("tunnel_id" in binding
				? { tunnelId: binding.tunnel_id }
				: { networkId: binding.network_id }),
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.mtlsCertificates ?? {})) {
		env[name] = {
			type: "mtls-certificate",
			id: binding.certificate_id,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.helloWorld ?? {})) {
		env[name] = { type: "hello-world", enable_timer: binding.enable_timer };
	}
	for (const [name, binding] of Object.entries(worker.flagship ?? {})) {
		env[name] = {
			type: "flagship",
			id: binding.app_id,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const [name, binding] of Object.entries(worker.artifacts ?? {})) {
		env[name] = {
			type: "artifacts",
			namespace: binding.namespace,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
	for (const name of Object.keys(worker.workerLoaders ?? {})) {
		env[name] = { type: "worker-loader" };
	}
	addBrowserRenderingBinding(env, worker.browserRendering, isRemote);
	addSingletonBinding(env, worker.images, "images", isRemote);
	addSingletonBinding(env, worker.stream, "stream", isRemote);
	addSingletonBinding(env, worker.media, "media", isRemote);
	if (worker.versionMetadata) {
		env[worker.versionMetadata] = { type: "version-metadata" };
	}
	for (const [bindingName, workflow] of Object.entries(
		worker.workflows ?? {}
	)) {
		if (workflow.external !== undefined) {
			throwUnsupportedOption("workflows[].external");
		}
		const targetWorkerName = workflow.scriptName ?? config.name;
		env[bindingName] = {
			type: "workflow",
			name: workflow.name,
			workerName: targetWorkerName,
			exportName: workflow.className,
			limits:
				workflow.stepLimit === undefined
					? undefined
					: { steps: workflow.stepLimit },
		};
	}
}

function addPipelineBindings(
	env: Env,
	pipelines: ParsedV4WorkerOptions["pipelines"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	if (pipelines === undefined) {
		return;
	}
	if (Array.isArray(pipelines)) {
		for (const name of pipelines) {
			env[name] = { type: "pipeline", name };
		}
		return;
	}
	for (const [name, binding] of Object.entries(pipelines)) {
		env[name] = {
			type: "pipeline",
			name:
				typeof binding === "string"
					? binding
					: "stream" in binding
						? binding.stream
						: binding.pipeline,
			dev:
				typeof binding === "string"
					? undefined
					: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
}

function configAssets(
	env: Env,
	config: MiniflareWorkerConfig,
	worker: ParsedV4WorkerOptions
) {
	const assets = worker.assets;
	if (assets === undefined) {
		return;
	}
	if (assets.workerName !== undefined) {
		throwUnsupportedOption("assets.workerName");
	}
	config.assets = {
		directory: assets.directory,
		hasUserWorker: getBooleanProperty(assets.routerConfig, "has_user_worker"),
		htmlHandling: getHtmlHandling(
			getStringProperty(assets.assetConfig, "html_handling")
		),
		notFoundHandling: getNotFoundHandling(
			getStringProperty(assets.assetConfig, "not_found_handling")
		),
		runWorkerFirst: getRunWorkerFirst(
			assets.run_worker_first,
			assets.routerConfig
		),
	};
	if (assets.binding !== undefined) {
		env[assets.binding] = { type: "assets" };
	}
}

function getStringProperty(
	record: Record<string, unknown> | undefined,
	key: string
) {
	const value = record?.[key];
	return typeof value === "string" ? value : undefined;
}

function getBooleanProperty(
	record: Record<string, unknown> | undefined,
	key: string
) {
	const value = record?.[key];
	return typeof value === "boolean" ? value : undefined;
}

function getRunWorkerFirst(
	value: NonNullable<ParsedV4WorkerOptions["assets"]>["run_worker_first"],
	routerConfig: Record<string, unknown> | undefined
): boolean | string[] | undefined {
	if (typeof value === "boolean") {
		return value;
	}
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		return value;
	}
	return getBooleanProperty(routerConfig, "invoke_user_worker_ahead_of_assets");
}

function getHtmlHandling(value: string | undefined): Assets["htmlHandling"] {
	switch (value) {
		case "auto-trailing-slash":
		case "drop-trailing-slash":
		case "force-trailing-slash":
		case "none":
			return value;
	}
}

function getNotFoundHandling(
	value: string | undefined
): Assets["notFoundHandling"] {
	switch (value) {
		case "single-page-application":
		case "404-page":
		case "none":
			return value;
	}
}

function addBrowserRenderingBinding(
	env: Env,
	binding: ParsedV4WorkerOptions["browserRendering"],
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	if (binding !== undefined) {
		env[binding.binding] = {
			type: "browser",
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
			headful: binding.headful,
		};
	}
}

function addSingletonBinding<
	T extends "browser" | "images" | "stream" | "media",
>(
	env: Env,
	binding:
		| {
				binding: string;
				remoteProxyConnectionString?: RemoteProxyConnectionString;
		  }
		| undefined,
	type: T,
	isRemote: (value: RemoteProxyConnectionString | undefined) => boolean
) {
	if (binding !== undefined) {
		env[binding.binding] = {
			type,
			dev: { remote: isRemote(binding.remoteProxyConnectionString) },
		};
	}
}

function throwUnsupportedOption(option: string): never {
	throw new TypeError(
		`Cannot convert v4 Miniflare option ${JSON.stringify(option)} to v5 options without losing behavior.`
	);
}
