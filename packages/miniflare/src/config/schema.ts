import path from "node:path";
import {
	AnalyticsEngineDatasetBindingSchema,
	AssetsSchema as RawAssetsConfigSchema,
	BrowserBindingSchema,
	D1BindingSchema,
	DurableObjectCreatedExportSchema,
	DurableObjectDeletedExportSchema,
	DurableObjectExpectingTransferExportSchema,
	DurableObjectRenamedExportSchema,
	DurableObjectTransferredExportSchema,
	FlagshipBindingSchema,
	HyperdriveBindingSchema,
	KnownBindingSchema,
	KVBindingSchema,
	ModuleTypeSchema,
	OutputWorkerSchema,
	QueueBindingSchema,
	R2BindingSchema,
	UnsafeBindingSchema,
	WorkerBindingSchema,
	WorkerEntrypointExportSchema,
	TailConsumerSchema,
	validateSingletonBindings,
} from "@cloudflare/config";
import { z } from "zod";
import { HOST_CAPNP_CONNECT } from "../plugins/shared/constants";
import {
	HttpOptions_Style,
	TlsOptions_Version,
} from "../runtime/config/workerd";
import { kCurrentWorker } from "./current-worker";
import type { Request, Response } from "../http";
import type {
	Miniflare,
	RemoteProxyConnectionString,
	WorkerdStructuredLog,
} from "../index";
import type { DOContainerOptions } from "../plugins/do";
import type { UnsafeUniqueKey } from "../plugins/shared/constants";
import type { Log } from "../shared";
import type { WorkerRegistry } from "../shared/dev-registry-types";
import type { Awaitable } from "../workers";
import type * as http from "node:http";

const AbsolutePathSchema = z
	.string()
	.refine((value) => path.isAbsolute(value), {
		message: "Path must be absolute",
	});

/**
 * The modules that make up a Worker, with their contents provided inline.
 */
export const MiniflareModuleSchema = z.strictObject({
	type: ModuleTypeSchema,
	contents: z.union([z.string(), z.instanceof(Uint8Array)]),
});

export const MiniflareManifestSchema = z.strictObject({
	mainModule: z.string(),
	/** Absolute source directory for manifest module names. Defaults to cwd. */
	modulesRoot: AbsolutePathSchema.default(() => process.cwd()),
	modules: z.record(z.string(), MiniflareModuleSchema),
});

// ---------------------------------------------------------------------------
// Miniflare-only binding extensions
// ---------------------------------------------------------------------------

export { kCurrentWorker };

/**
 * A function-backed "service binding".
 */
const FetcherBindingSchema = z.strictObject({
	type: z.literal("fetcher"),
	handler: z.custom<
		(request: Request, miniflare: Miniflare) => Awaitable<Response>
	>((v) => typeof v === "function"),
});

/**
 * A Node.js http-style service binding handler.
 */
const NodeHandlerBindingSchema = z.strictObject({
	type: z.literal("node-handler"),
	handler: z.custom<
		(
			req: http.IncomingMessage,
			res: http.ServerResponse,
			miniflare: Miniflare
		) => Awaitable<void>
	>((v) => typeof v === "function"),
});

// Zod validators for workerd's builtin services (`runtime/config/workerd.ts`).
// All fields are optional except where a value is structurally required.

const HttpOptionsHeaderSchema = z.strictObject({
	name: z.string(),
	// If omitted, the header will be removed.
	value: z.string().optional(),
});

const HttpOptionsSchema = z
	.strictObject({
		style: z.enum(HttpOptions_Style).optional(),
		forwardedProtoHeader: z.string().optional(),
		cfBlobHeader: z.string().optional(),
		injectRequestHeaders: HttpOptionsHeaderSchema.array().optional(),
		injectResponseHeaders: HttpOptionsHeaderSchema.array().optional(),
	})
	.transform((options) => ({
		...options,
		capnpConnectHost: HOST_CAPNP_CONNECT,
	}));

const TlsOptionsKeypairSchema = z.strictObject({
	privateKey: z.string().optional(),
	certificateChain: z.string().optional(),
});

const TlsOptionsSchema = z.strictObject({
	keypair: TlsOptionsKeypairSchema.optional(),
	requireClientCerts: z.boolean().optional(),
	trustBrowserCas: z.boolean().optional(),
	trustedCertificates: z.string().array().optional(),
	minVersion: z.enum(TlsOptions_Version).optional(),
	cipherList: z.string().optional(),
});

/**
 * Binds directly to workerd's `network` service, allowing a worker to make
 * arbitrary outbound connections (subject to `allow`/`deny` filters).
 */
const NetworkServiceBindingSchema = z.strictObject({
	type: z.literal("network"),
	allow: z.string().array().optional(),
	deny: z.string().array().optional(),
	tlsOptions: TlsOptionsSchema.optional(),
});

/**
 * Binds directly to workerd's `external` service, forwarding subrequests to a
 * server reachable at `address`.
 */
const ExternalServiceBindingSchema = z
	.strictObject({
		type: z.literal("external"),
		address: z.string(),
		http: HttpOptionsSchema.optional(),
		https: z
			.strictObject({
				options: HttpOptionsSchema.optional(),
				tlsOptions: TlsOptionsSchema.optional(),
				certificateHost: z.string().optional(),
			})
			.optional(),
	})
	.refine((data) => !(data.http !== undefined && data.https !== undefined), {
		message: "Cannot specify both 'http' and 'https'",
	});

/**
 * Binds directly to workerd's `disk` service, serving files from `path`.
 */
const DiskServiceBindingSchema = z.strictObject({
	type: z.literal("disk"),
	/** Directory served by the workerd disk service; passed through as-is. */
	path: z.string(),
	writable: z.boolean().optional(),
});

/**
 * Extended browser binding with `headful` (local-only, so not in config schema).
 */
const MiniflareBrowserBindingSchema = BrowserBindingSchema.extend({
	headful: z.boolean().optional(),
});

const MiniflareHyperdriveBindingSchema = HyperdriveBindingSchema.extend({
	dev: z.strictObject({ connectionString: z.string() }),
});

/**
 * Extended worker (service) binding. `workerName` may be `kCurrentWorker`
 * (the SELF marker) in addition to a plain worker name.
 */
const MiniflareWorkerBindingSchema = WorkerBindingSchema.extend({
	workerName: z.union([
		z.string(),
		z.custom<typeof kCurrentWorker>((v) => v === kCurrentWorker),
	]),
});

/**
 * The `hello-world` binding backs an internal example/test plugin and has no
 * `@cloudflare/config` equivalent, so it lives only in the miniflare schema.
 */
const HelloWorldBindingSchema = z.strictObject({
	type: z.literal("hello-world"),
	enable_timer: z.boolean().optional(),
});

const MiniflareWorkflowBindingSchema = z.strictObject({
	type: z.literal("workflow"),
	name: z.string(),
	workerName: z.string(),
	exportName: z.string(),
	limits: z.strictObject({ steps: z.number().optional() }).optional(),
});

// The miniflare-extended schemas below replace these base `@cloudflare/config`
// binding schemas. Resource identifiers are still optional at this stage and
// are defaulted after parsing the full worker config.
const OVERRIDDEN_BASE_BINDING_SCHEMAS = [
	BrowserBindingSchema,
	WorkerBindingSchema,
	HyperdriveBindingSchema,
] as const;

// `Array.prototype.filter` removes the overridden base schemas at runtime, but
// does not narrow the tuple element type. Cast to also drop them at the type
// level so the Miniflare variants are the only variants in the union.
const PassthroughBindingSchemas = KnownBindingSchema.options.filter(
	(option) =>
		!(OVERRIDDEN_BASE_BINDING_SCHEMAS as readonly unknown[]).includes(option)
) as Exclude<
	(typeof KnownBindingSchema.options)[number],
	(typeof OVERRIDDEN_BASE_BINDING_SCHEMAS)[number]
>[];

const MiniflareKnownBindingSchema = z.discriminatedUnion("type", [
	MiniflareBrowserBindingSchema,
	MiniflareHyperdriveBindingSchema,
	MiniflareWorkerBindingSchema,
	FetcherBindingSchema,
	NodeHandlerBindingSchema,
	ExternalServiceBindingSchema,
	NetworkServiceBindingSchema,
	DiskServiceBindingSchema,
	HelloWorldBindingSchema,
	MiniflareWorkflowBindingSchema,
	...PassthroughBindingSchemas,
]);

const ParsedMiniflareKVBindingSchema = KVBindingSchema.omit({
	id: true,
}).extend({
	id: z.string(),
});

const ParsedMiniflareD1BindingSchema = D1BindingSchema.omit({
	id: true,
}).extend({
	id: z.string(),
});

const ParsedMiniflareFlagshipBindingSchema = FlagshipBindingSchema.omit({
	id: true,
}).extend({
	id: z.string(),
});

const ParsedMiniflareR2BindingSchema = R2BindingSchema.omit({
	name: true,
}).extend({
	name: z.string(),
});

const ParsedMiniflareAnalyticsEngineDatasetBindingSchema =
	AnalyticsEngineDatasetBindingSchema.omit({
		name: true,
	}).extend({
		name: z.string(),
	});

const ParsedMiniflareQueueBindingSchema = QueueBindingSchema.omit({
	name: true,
}).extend({
	name: z.string(),
});

const OVERRIDDEN_PARSED_BINDING_SCHEMAS = [
	KVBindingSchema,
	D1BindingSchema,
	FlagshipBindingSchema,
	R2BindingSchema,
	AnalyticsEngineDatasetBindingSchema,
	QueueBindingSchema,
] as const;

const ParsedPassthroughBindingSchemas =
	MiniflareKnownBindingSchema.options.filter(
		(option) =>
			!(OVERRIDDEN_PARSED_BINDING_SCHEMAS as readonly unknown[]).includes(
				option
			)
	) as Exclude<
		(typeof MiniflareKnownBindingSchema.options)[number],
		(typeof OVERRIDDEN_PARSED_BINDING_SCHEMAS)[number]
	>[];

export const ParsedMiniflareKnownBindingSchema = z.discriminatedUnion("type", [
	ParsedMiniflareKVBindingSchema,
	ParsedMiniflareD1BindingSchema,
	ParsedMiniflareFlagshipBindingSchema,
	ParsedMiniflareR2BindingSchema,
	ParsedMiniflareAnalyticsEngineDatasetBindingSchema,
	ParsedMiniflareQueueBindingSchema,
	...ParsedPassthroughBindingSchemas,
]);

/**
 * Validates a single binding. `unsafe:*` bindings pass through the loose
 * unsafe-binding schema (mirroring the config `BindingSchema`); everything
 * else is validated against the miniflare-extended known binding union.
 */
const MiniflareBindingSchema = z.unknown().transform((value, ctx) => {
	const isUnsafe =
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof value.type === "string" &&
		value.type.startsWith("unsafe:");

	const schema = isUnsafe ? UnsafeBindingSchema : MiniflareKnownBindingSchema;
	const result = schema.safeParse(value);

	if (!result.success) {
		ctx.issues.push(...(result.error.issues as unknown as typeof ctx.issues));
		return z.NEVER;
	}

	return result.data;
}) as z.ZodType<
	| z.output<typeof MiniflareKnownBindingSchema>
	| z.output<typeof UnsafeBindingSchema>,
	| z.input<typeof MiniflareKnownBindingSchema>
	| z.input<typeof UnsafeBindingSchema>
>;

// ---------------------------------------------------------------------------
// Miniflare-only export extensions
// ---------------------------------------------------------------------------

/**
 * Extends live DO exports with miniflare-internal fields:
 * - `unsafeUniqueKey` — custom unique key for DO namespace identity
 * - `unsafePreventEviction` — prevents the DO from being evicted
 * - `container` — container config for container-attached DOs
 */
export const MiniflareDurableObjectExportSchema =
	DurableObjectCreatedExportSchema.extend({
		unsafeUniqueKey: z.custom<UnsafeUniqueKey>().optional(),
		unsafePreventEviction: z.boolean().optional(),
		container: z.custom<DOContainerOptions>().optional(),
	});
export const MiniflareDurableObjectExpectingTransferExportSchema =
	DurableObjectExpectingTransferExportSchema.extend({
		unsafeUniqueKey: z.custom<UnsafeUniqueKey>().optional(),
		unsafePreventEviction: z.boolean().optional(),
		container: z.custom<DOContainerOptions>().optional(),
	});

// const MiniflareWorkflowExportSchema = z.strictObject({
// 	type: z.literal("workflow"),
// 	name: z.string(),
// 	limits: z.strictObject({ steps: z.number().optional() }).optional(),
// });

// Compose the unions explicitly (rather than filtering `ExportSchema.options`)
// so the inferred type is precise: the miniflare-extended "created" variant
// replaces the plain one, and `Array.prototype.filter` can't narrow the element
// type.
const MiniflareLiveExportSchema = z.union([
	MiniflareDurableObjectExportSchema,
	MiniflareDurableObjectExpectingTransferExportSchema,
	WorkerEntrypointExportSchema,
	// MiniflareWorkflowExportSchema,
]);
const MiniflareAcceptedExportSchema = z.union([
	MiniflareDurableObjectExportSchema,
	DurableObjectDeletedExportSchema,
	DurableObjectRenamedExportSchema,
	DurableObjectTransferredExportSchema,
	MiniflareDurableObjectExpectingTransferExportSchema,
	WorkerEntrypointExportSchema,
	// MiniflareWorkflowExportSchema,
]);

const MiniflareExportsSchema = z
	.record(z.string(), MiniflareAcceptedExportSchema)
	.transform((exports) => {
		return Object.fromEntries(
			Object.entries(exports).filter(([, exported]) => {
				return exported.type !== "durable-object" || "storage" in exported;
			})
		) as Record<string, z.output<typeof MiniflareLiveExportSchema>>;
	});

// ---------------------------------------------------------------------------
// Miniflare-only assets extension
// ---------------------------------------------------------------------------

/**
 * Extends the config `assets` block with:
 * - `directory` — directory to serve, resolved against `dev.rootPath` if relative.
 * - `hasUserWorker` — whether the worker has a user-authored script the asset
 *   router should fall back to for unmatched requests. Cannot be inferred from
 *   manifest presence: wrangler injects a placeholder script for assets-only
 *   workers, so this must be supplied explicitly (defaults to `false`).
 */
const MiniflareAssetsSchema = RawAssetsConfigSchema.extend({
	/** Assets directory to serve; relative to `dev.rootPath` if not absolute. */
	directory: z.string(),
	hasUserWorker: z.boolean().default(false),
});

/**
 * Extends the config tail-consumer entry with miniflare-internal `entrypoint`
 * and `props`. These let a tail consumer be rerouted through the dev-registry
 * proxy worker (`ExternalServiceProxy`) when the target worker lives in another
 * Miniflare instance, mirroring the `worker`/`durable-object` reroute.
 */
const MiniflareTailConsumerSchema = TailConsumerSchema.extend({
	entrypoint: z.string().optional(),
	props: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Worker config schema (extends OutputWorkerSchema)
// ---------------------------------------------------------------------------

/** A single parsed `config.env` binding (known, miniflare-extended, or unsafe). */
export type MiniflareBinding =
	| z.output<typeof ParsedMiniflareKnownBindingSchema>
	| z.output<typeof UnsafeBindingSchema>;

/** Returns whether a parsed Miniflare binding is an unsafe plugin binding. */
export function isMiniflareUnsafeBinding(
	binding: MiniflareBinding
): binding is z.output<typeof UnsafeBindingSchema> {
	return binding.type.startsWith("unsafe:");
}

export const MiniflareWorkerConfigBaseSchema = OutputWorkerSchema.omit({
	manifest: true,
	env: true,
	exports: true,
	assets: true,
	tailConsumers: true,
}).extend({
	manifest: MiniflareManifestSchema.optional(),
	env: z
		.record(z.string(), MiniflareBindingSchema)
		.superRefine(validateSingletonBindings)
		.optional(),
	exports: MiniflareExportsSchema.optional(),
	assets: MiniflareAssetsSchema.optional(),
	tailConsumers: z.array(MiniflareTailConsumerSchema).optional(),
});

export type ParsedMiniflareWorkerConfig = Omit<
	z.output<typeof MiniflareWorkerConfigBaseSchema>,
	"env"
> & {
	env?: Record<string, MiniflareBinding>;
};

function getDefaultBindingIdentifier(bindingName: string, workerName: string) {
	return `${bindingName}-${workerName || "worker"}`;
}

function defaultBindingIdentifiers(
	config: z.output<typeof MiniflareWorkerConfigBaseSchema>
): ParsedMiniflareWorkerConfig {
	if (config.env === undefined) {
		const { env: _env, ...configWithoutEnv } = config;
		return configWithoutEnv;
	}

	const env: Record<string, MiniflareBinding> = Object.fromEntries(
		Object.entries(config.env).map(([bindingName, binding]) => {
			const defaultIdentifier = getDefaultBindingIdentifier(
				bindingName,
				config.name
			);

			switch (binding.type) {
				case "kv":
				case "d1":
				case "flagship":
					return [
						bindingName,
						{ ...binding, id: binding.id ?? defaultIdentifier },
					];
				case "r2":
				case "analytics-engine-dataset":
				case "queue":
					return [
						bindingName,
						{ ...binding, name: binding.name ?? defaultIdentifier },
					];
				default:
					return [bindingName, binding];
			}
		})
	);

	return { ...config, env };
}

export const MiniflareWorkerConfigSchema =
	MiniflareWorkerConfigBaseSchema.transform<ParsedMiniflareWorkerConfig>(
		defaultBindingIdentifiers
	);

export type MiniflareWorkerConfig = z.input<typeof MiniflareWorkerConfigSchema>;
/** A parsed `worker` (service) binding, extended with `kCurrentWorker` support. */
export type MiniflareWorkerBinding = Extract<
	MiniflareBinding,
	{ type: "worker" }
>;
/** A parsed function-backed `fetcher` service binding. */
export type MiniflareFetcherBinding = Extract<
	MiniflareBinding,
	{ type: "fetcher" }
>;
/** A parsed Node.js http-style `node-handler` service binding. */
export type MiniflareNodeHandlerBinding = Extract<
	MiniflareBinding,
	{ type: "node-handler" }
>;
/** A parsed binding to workerd's builtin `network` service. */
export type MiniflareNetworkServiceBinding = Extract<
	MiniflareBinding,
	{ type: "network" }
>;
/** A parsed binding to workerd's builtin `external` service. */
export type MiniflareExternalServiceBinding = Extract<
	MiniflareBinding,
	{ type: "external" }
>;
/** A parsed binding to workerd's builtin `disk` service. */
export type MiniflareDiskServiceBinding = Extract<
	MiniflareBinding,
	{ type: "disk" }
>;
/**
 * Any service-binding variant: a `worker`/`fetcher`/`node-handler` custom
 * service, or a `network`/`external`/`disk` workerd builtin service.
 */
export type MiniflareServiceBinding =
	| MiniflareWorkerBinding
	| MiniflareFetcherBinding
	| MiniflareNodeHandlerBinding
	| MiniflareNetworkServiceBinding
	| MiniflareExternalServiceBinding
	| MiniflareDiskServiceBinding;
/** A single parsed `config.exports` entry. */
export type MiniflareExport = NonNullable<
	ParsedMiniflareWorkerConfig["exports"]
>[string];
/** A single parsed `config.triggers` entry. */
export type MiniflareTrigger = NonNullable<
	ParsedMiniflareWorkerConfig["triggers"]
>[number];

// ---------------------------------------------------------------------------
// Dev config
// ---------------------------------------------------------------------------

const UnsafeDirectSocketSchema = z.strictObject({
	host: z.string().optional(),
	port: z.number().optional(),
	serviceName: z.string().optional(),
	entrypoint: z.string().optional(),
	proxy: z.boolean().optional(),
});

/**
 * The outbound service intercepts a worker's outgoing `fetch()` subrequests. It
 * accepts a function-backed `fetcher` binding, a Node.js http-style
 * `node-handler`, or a `worker` service binding.
 */
const OutboundServiceSchema = z.discriminatedUnion("type", [
	FetcherBindingSchema,
	NodeHandlerBindingSchema,
	WorkerBindingSchema,
]);

export const DevConfigSchema = z.strictObject({
	/** Absolute base directory for path options. Defaults to cwd. */
	rootPath: AbsolutePathSchema.default(() => process.cwd()),
	// Enables the Cache API (NOT Workers cache).
	// not user-configurable (only Wrangler's internal ProxyWorker disables it).
	cacheAPI: z.boolean().default(true),
	outboundService: OutboundServiceSchema.optional(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
	unsafeInspectorProxy: z.boolean().optional(),
	unsafeDirectSockets: z.array(UnsafeDirectSocketSchema).optional(),
	unsafeOverrideFetchWorker: z.string().optional(),
	unsafeEvalBinding: z.string().optional(),
	useModuleFallbackService: z.boolean().optional(),
	/** Whether this Worker is 'public' - whether should be advertised in the dev registry
	 * and whether it should be included in local obs capture. Defaults to `true`. */
	unsafeRegisterWorker: z.boolean().default(true),
	// TODO(soon): remove in favour of per-object `unsafeUniqueKey: kEphemeralUniqueKey`
	unsafeEphemeralDurableObjects: z.boolean().optional(),
	// Strip the CF-Connecting-IP header from outbound fetches
	stripCfConnectingIp: z.boolean().default(true),
	// Zone to use for the CF-Worker header in outbound fetches. If not
	// specified, defaults to `${worker-name}.example.com`
	zone: z.string().optional(),
	/** Cloudflare Access authentication metadata exposed as `ctx.access` */
	access: z
		.strictObject({
			aud: z.string(),
			identity: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
});

export type DevConfig = z.input<typeof DevConfigSchema>;

// ---------------------------------------------------------------------------
// Legacy config (service-worker format, Workers Sites)
// ---------------------------------------------------------------------------

export const LegacyConfigSchema = z.strictObject({
	// Service-worker format (non-module, global `addEventListener`) script,
	// provided directly by the caller (e.g. wrangler for service-worker workers).
	serviceWorkerScript: z.string().optional(),
	/** Source path for `serviceWorkerScript`; relative to `dev.rootPath` if not absolute. */
	serviceWorkerScriptPath: z.string().optional(),
	/** WASM binding file paths; string values are relative to `dev.rootPath` if not absolute. */
	wasmBindings: z
		.record(z.string(), z.union([z.string(), z.instanceof(Uint8Array)]))
		.optional(),
	/** Text blob binding file paths; values are relative to `dev.rootPath` if not absolute. */
	textBlobBindings: z.record(z.string(), z.string()).optional(),
	/** Data blob binding file paths; string values are relative to `dev.rootPath` if not absolute. */
	dataBlobBindings: z
		.record(z.string(), z.union([z.string(), z.instanceof(Uint8Array)]))
		.optional(),
	/** Workers Sites asset directory; relative to `dev.rootPath` if not absolute. */
	sitePath: z.string().optional(),
	siteInclude: z.array(z.string()).optional(),
	siteExclude: z.array(z.string()).optional(),
});

export type LegacyConfig = z.input<typeof LegacyConfigSchema>;

// ---------------------------------------------------------------------------
// Per-worker options
// ---------------------------------------------------------------------------

export const WorkerOptionsSchema = z.strictObject({
	config: MiniflareWorkerConfigSchema,
	legacy: LegacyConfigSchema.optional(),
	dev: DevConfigSchema.default(() => DevConfigSchema.parse({})),
});

export type WorkerOptions = z.input<typeof WorkerOptionsSchema>;

/**
 * A single fully-parsed worker's options, as passed to plugin methods.
 */
export type ParsedWorkerOptions = z.output<typeof WorkerOptionsSchema>;

// ---------------------------------------------------------------------------
//  Instance-wide options
// ---------------------------------------------------------------------------

export const InstanceOptionsSchema = z.strictObject({
	// Server
	host: z.string().optional(),
	port: z.number().optional(),
	https: z.boolean().optional(),
	httpsKey: z.string().optional(),
	httpsCert: z.string().optional(),

	// Inspector
	inspectorPort: z.number().optional(),
	inspectorHost: z.string().optional(),

	// Runtime
	verbose: z.boolean().optional(),
	log: z.custom<Log>().optional(),
	handleStructuredLogs: z
		.custom<(log: WorkerdStructuredLog) => void>()
		.optional(),
	handleUncaughtError: z
		.custom<(error: Error) => void>((value) => typeof value === "function")
		.optional(),
	upstream: z.string().optional(),
	cf: z
		.union([z.boolean(), z.string(), z.record(z.string(), z.any())])
		.optional(),

	// Logging
	logRequests: z.boolean().default(true),
	stripDisablePrettyError: z.boolean().default(true),

	// Persistence
	/**
	 * Root directory for persisted local resource state; relative to cwd if not
	 * absolute. When `unsafeEnableSharedStorage` is set this is canonicalised to
	 * an absolute real path before use, so every instance sharing the directory
	 * derives the same ownership scope.
	 */
	resourcePersistencePath: z.string().optional(),
	/**
	 * Root for resources that cannot participate in shared storage. Belongs at
	 * the project level -- each project keeps its own copy of this state rather
	 * than partitioning it under the shared resource root.
	 *
	 * Required when `unsafeEnableSharedStorage` is set. Parsing resolves this to
	 * the effective isolated root, falling back to `resourcePersistencePath`
	 * when shared storage is off, so readers never need to decide themselves.
	 */
	isolatedResourcePersistencePath: z.string().optional(),
	/** Project temp directory for plugin files; relative to cwd if not absolute. */
	resourceTmpPath: z.string().optional(),

	unsafeEnableSharedStorage: z.boolean().optional(),

	containerEngine: z
		.union([
			z.string(),
			z.strictObject({
				localDocker: z.strictObject({
					/** Docker socket path; passed through as-is. */
					socketPath: z.string(),
					containerEgressInterceptorImage: z.string().optional(),
				}),
			}),
		])
		.optional(),

	// Telemetry
	telemetry: z
		.strictObject({
			enabled: z.boolean().default(false),
			deviceId: z.string().optional(),
		})
		.default({ enabled: false }),

	// Internal
	publicUrl: z.url().optional(),
	/** Dev registry filesystem path; relative to cwd if not absolute. */
	unsafeDevRegistryPath: z.string().optional(),
	unsafeHandleDevRegistryUpdate: z
		.custom<(registry: WorkerRegistry) => void>()
		.optional(),
	// Called after Miniflare has automatically restarted the `workerd`
	// runtime following an unexpected crash. Lets embedders (e.g. the Vite
	// plugin) re-establish any state that lived in the crashed process,
	// such as module runners created over a separate bootstrap channel.
	unsafeHandleRuntimeRestart: z
		.custom<() => Awaitable<void>>((value) => typeof value === "function")
		.optional(),
	unsafeProxySharedSecret: z.string().optional(),
	unsafeModuleFallbackService: z
		.custom<(request: Request, miniflare: Miniflare) => Awaitable<Response>>()
		.optional(),
	unsafeTriggerHandlers: z.boolean().optional(),
	unsafeRuntimeEnv: z.record(z.string(), z.string()).optional(),
	unsafeLocalExplorer: z.boolean().optional(),
	// Turn on local-dev observability: attach the trace collector to the
	// user's worker(s) so it receives their tail events.
	unsafeObservability: z.boolean().optional(),
	unsafeInspectDurableObjects: z.boolean().optional(),
});

export type InstanceOptions = z.input<typeof InstanceOptionsSchema>;

/**
 * The fully-parsed instance-wide (shared) options, as passed to plugin methods.
 */
export type ParsedInstanceOptions = z.output<typeof InstanceOptionsSchema>;
export type ParsedDevConfig = NonNullable<ParsedWorkerOptions["dev"]>;
export type ParsedLegacyConfig = NonNullable<ParsedWorkerOptions["legacy"]>;

// ---------------------------------------------------------------------------
// Final Miniflare Schema
// ---------------------------------------------------------------------------

export const MiniflareOptionsSchema = InstanceOptionsSchema.extend({
	workers: z.array(WorkerOptionsSchema),
})
	.superRefine((options, ctx) => {
		if (!options.unsafeEnableSharedStorage) {
			return;
		}
		if (!options.resourcePersistencePath?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["resourcePersistencePath"],
				message:
					"Shared storage requires `resourcePersistencePath` to be set to the directory instances should share.",
			});
		}
		if (!options.isolatedResourcePersistencePath?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["isolatedResourcePersistencePath"],
				message:
					"Shared storage requires `isolatedResourcePersistencePath` to be set to a per-project directory, for resources that cannot be shared.",
			});
		}
		if (!options.unsafeDevRegistryPath?.trim()) {
			ctx.addIssue({
				code: "custom",
				path: ["unsafeDevRegistryPath"],
				message:
					"Shared storage requires `unsafeDevRegistryPath` to be set, as instances elect a storage owner through the dev registry.",
			});
		}
	})
	.transform((options) => ({
		...options,
		// Resolve the effective isolated root once, here, so that everything
		// downstream reads a single field that is always the path to persist to.
		// Without shared storage nothing is shared, so every resource is isolated
		// and the configured resource root is the isolated root. Validation above
		// has already required an explicit isolated root when sharing is enabled.
		isolatedResourcePersistencePath: options.unsafeEnableSharedStorage
			? options.isolatedResourcePersistencePath
			: options.resourcePersistencePath,
	}));

export type MiniflareOptions = z.input<typeof MiniflareOptionsSchema>;

// ---------------------------------------------------------------------------
// Binding / export helpers (shared by plugins)
// ---------------------------------------------------------------------------

/**
 * Returns the entries of `config.env` whose binding `type` matches `type`,
 * typed as the matching binding variant. The record key is the binding name.
 */
export function getEnvBindingsOfType<T extends string>(
	config: ParsedMiniflareWorkerConfig,
	type: T
): [name: string, binding: Extract<MiniflareBinding, { type: T }>][] {
	return Object.entries(config.env ?? {}).filter(
		([, binding]) => binding.type === type
	) as [name: string, binding: Extract<MiniflareBinding, { type: T }>][];
}

/**
 * Returns the entries of `config.exports` whose `type` matches `type`. The
 * record key is the export name.
 */
export function getExportsOfType<T extends string>(
	config: ParsedMiniflareWorkerConfig,
	type: T
): [name: string, exported: Extract<MiniflareExport, { type: T }>][] {
	return Object.entries(config.exports ?? {}).filter(
		([, exported]) => exported.type === type
	) as [name: string, exported: Extract<MiniflareExport, { type: T }>][];
}

/**
 * Returns the entries of `config.triggers` whose `type` matches `type`.
 */
export function getTriggersOfType<T extends string>(
	config: ParsedMiniflareWorkerConfig,
	type: T
): Extract<MiniflareTrigger, { type: T }>[] {
	return (config.triggers ?? []).filter(
		(trigger) => trigger.type === type
	) as Extract<MiniflareTrigger, { type: T }>[];
}

/**
 * Resolves the remote proxy connection string for a binding. A binding is
 * proxied remotely iff `binding.dev.remote === true` _and_
 * `dev.remoteProxyConnectionString` is set (mirroring wrangler's model).
 */
export function getRemoteProxyConnectionString(
	binding: { dev?: { remote?: boolean } },
	dev: ParsedDevConfig | undefined
): RemoteProxyConnectionString | undefined {
	return binding.dev?.remote && dev?.remoteProxyConnectionString
		? dev.remoteProxyConnectionString
		: undefined;
}
