import {
	AssetsSchema as RawAssetsConfigSchema,
	BrowserBindingSchema,
	DurableObjectCreatedExportSchema,
	DurableObjectDeletedExportSchema,
	DurableObjectExpectingTransferExportSchema,
	DurableObjectRenamedExportSchema,
	DurableObjectTransferredExportSchema,
	KnownBindingSchema,
	ModuleTypeSchema,
	OutputWorkerSchema,
	UnsafeBindingSchema,
	WorkerBindingSchema,
	WorkerEntrypointExportSchema,
	KVBindingSchema,
	D1BindingSchema,
	R2BindingSchema,
	QueueBindingSchema,
	FlagshipBindingSchema,
} from "@cloudflare/config";
import { z } from "zod";
import { HOST_CAPNP_CONNECT } from "../plugins/shared/constants";
import {
	HttpOptions_Style,
	TlsOptions_Version,
} from "../runtime/config/workerd";
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

/**
 * The modules that make up a Worker, with their contents provided inline.
 */
export const MiniflareModuleSchema = z.strictObject({
	type: ModuleTypeSchema,
	contents: z.union([z.string(), z.instanceof(Uint8Array)]),
});

export const MiniflareManifestSchema = z.strictObject({
	mainModule: z.string(),
	modules: z.record(z.string(), MiniflareModuleSchema),
});

// ---------------------------------------------------------------------------
// Miniflare-only binding extensions
// ---------------------------------------------------------------------------

// Service binding designator that always points to the worker with the binding.
// Using `Symbol.for()` instead of `Symbol()` in case multiple copies of
// `miniflare` are loaded (e.g. when configuring Vitest and when running pool)
export const kCurrentWorker = Symbol.for("miniflare.kCurrentWorker");

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

const HttpOptionsHeaderSchema = z.object({
	name: z.string(),
	// If omitted, the header will be removed.
	value: z.string().optional(),
});

const HttpOptionsSchema = z
	.object({
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

const TlsOptionsKeypairSchema = z.object({
	privateKey: z.string().optional(),
	certificateChain: z.string().optional(),
});

const TlsOptionsSchema = z.object({
	keypair: TlsOptionsKeypairSchema.optional(),
	requireClientCerts: z.boolean().optional(),
	trustBrowserCas: z.boolean().optional(),
	trustedCertificates: z.string().array().optional(),
	minVersion: z.nativeEnum(TlsOptions_Version).optional(),
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
			.object({
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
	path: z.string(),
	writable: z.boolean().optional(),
});

/**
 * Extended browser binding with `headful` (local-only, so not in config schema).
 */
const MiniflareBrowserBindingSchema = BrowserBindingSchema.extend({
	headful: z.boolean().optional(),
});

/**
 * Force id to be required
 */
const MiniflareKVBindingSchema = KVBindingSchema.omit({
	id: true,
}).extend({
	id: z.string(),
});

/**
 * Force id to be required
 */
const MiniflareD1BindingSchema = D1BindingSchema.omit({
	id: true,
}).extend({
	id: z.string(),
});

/**
 * Force id to be required
 */
const MiniflareFlagshipBindingSchema = FlagshipBindingSchema.omit({
	id: true,
}).extend({
	id: z.string(),
});

/**
 * Force name to be required
 */
const MiniflareR2BindingSchema = R2BindingSchema.omit({
	name: true,
}).extend({
	name: z.string(),
});

/**
 * Force name to be required
 */
const MiniflareQueueBindingSchema = QueueBindingSchema.omit({
	name: true,
}).extend({
	name: z.string(),
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

// The miniflare-extended schemas below replace these base `@cloudflare/config`
// binding schemas (which have optional `id`/`name`) with variants that require
// those fields.
const OVERRIDDEN_BASE_BINDING_SCHEMAS = [
	BrowserBindingSchema,
	WorkerBindingSchema,
	QueueBindingSchema,
	R2BindingSchema,
	D1BindingSchema,
	KVBindingSchema,
	FlagshipBindingSchema,
] as const;

// `Array.prototype.filter` removes the overridden base schemas at runtime, but
// does not narrow the tuple element type. Cast to also drop them at the type
// level — otherwise the base variants (with optional `id`/`name`) would linger
// in the union alongside the overrides, widening `id`/`name` back to
// `string | undefined`.
const PassthroughBindingSchemas = KnownBindingSchema.options.filter(
	(option) =>
		!(OVERRIDDEN_BASE_BINDING_SCHEMAS as readonly unknown[]).includes(option)
) as Exclude<
	(typeof KnownBindingSchema.options)[number],
	(typeof OVERRIDDEN_BASE_BINDING_SCHEMAS)[number]
>[];

const MiniflareKnownBindingSchema = z.discriminatedUnion("type", [
	MiniflareBrowserBindingSchema,
	MiniflareQueueBindingSchema,
	MiniflareR2BindingSchema,
	MiniflareD1BindingSchema,
	MiniflareKVBindingSchema,
	MiniflareFlagshipBindingSchema,
	MiniflareWorkerBindingSchema,
	FetcherBindingSchema,
	NodeHandlerBindingSchema,
	ExternalServiceBindingSchema,
	NetworkServiceBindingSchema,
	DiskServiceBindingSchema,
	HelloWorldBindingSchema,
	...PassthroughBindingSchemas,
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
 * Extends the config's DO "created" export with miniflare-internal fields:
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

// Compose the union explicitly (rather than filtering `ExportSchema.options`)
// so the inferred type is precise: the miniflare-extended "created" variant
// replaces the plain one, and `Array.prototype.filter` can't narrow the element
// type.
const MiniflareExportSchema = z.union([
	MiniflareDurableObjectExportSchema,
	DurableObjectDeletedExportSchema,
	DurableObjectRenamedExportSchema,
	DurableObjectTransferredExportSchema,
	DurableObjectExpectingTransferExportSchema,
	WorkerEntrypointExportSchema,
]);

// ---------------------------------------------------------------------------
// Miniflare-only assets extension
// ---------------------------------------------------------------------------

/**
 * Extends the config `assets` block with:
 * - `directory` — resolved to an absolute path by the caller.
 * - `hasUserWorker` — whether the worker has a user-authored script the asset
 *   router should fall back to for unmatched requests. Cannot be inferred from
 *   manifest presence: wrangler injects a placeholder script for assets-only
 *   workers, so this must be supplied explicitly (defaults to `false`).
 */
const MiniflareAssetsSchema = RawAssetsConfigSchema.extend({
	directory: z.string(),
	hasUserWorker: z.boolean().default(false),
});

/**
 * Extends the config tail-consumer entry with miniflare-internal `entrypoint`
 * and `props`. These let a tail consumer be rerouted through the dev-registry
 * proxy worker (`ExternalServiceProxy`) when the target worker lives in another
 * Miniflare instance, mirroring the `worker`/`durable-object` reroute.
 */
const MiniflareTailConsumerSchema = z.object({
	workerName: z.string(),
	streaming: z.boolean().optional(),
	entrypoint: z.string().optional(),
	props: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Worker config schema (extends OutputWorkerSchema)
// ---------------------------------------------------------------------------

export const MiniflareWorkerConfigSchema = OutputWorkerSchema.omit({
	manifest: true,
	env: true,
	exports: true,
	assets: true,
	tailConsumers: true,
}).extend({
	manifest: MiniflareManifestSchema.optional(),
	env: z.record(z.string(), MiniflareBindingSchema).optional(),
	exports: z.record(z.string(), MiniflareExportSchema).optional(),
	assets: MiniflareAssetsSchema.optional(),
	tailConsumers: z.array(MiniflareTailConsumerSchema).optional(),
});

export type MiniflareWorkerConfig = z.input<typeof MiniflareWorkerConfigSchema>;
export type ParsedMiniflareWorkerConfig = z.output<
	typeof MiniflareWorkerConfigSchema
>;

/** A single parsed `config.env` binding (known, miniflare-extended, or unsafe). */
export type MiniflareBinding = NonNullable<
	ParsedMiniflareWorkerConfig["env"]
>[string];
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

const UnsafeDirectSocketSchema = z.object({
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
	hasAssetsAndIsVitest: z.boolean().optional(),
	// TODO(soon): remove in favour of per-object `unsafeUniqueKey: kEphemeralUniqueKey`
	unsafeEphemeralDurableObjects: z.boolean().optional(),
	// Strip the CF-Connecting-IP header from outbound fetches
	stripCfConnectingIp: z.boolean().default(true),
	// Zone to use for the CF-Worker header in outbound fetches. If not
	// specified, defaults to `${worker-name}.example.com`
	zone: z.string().optional(),
});

export type DevConfig = z.input<typeof DevConfigSchema>;

// ---------------------------------------------------------------------------
// Legacy config (service-worker format, Workers Sites)
// ---------------------------------------------------------------------------

export const LegacyConfigSchema = z.strictObject({
	// Service-worker format (non-module, global `addEventListener`) script,
	// provided directly by the caller (e.g. wrangler for service-worker workers).
	serviceWorkerScript: z.string().optional(),
	wasmBindings: z
		.record(z.string(), z.union([z.string(), z.instanceof(Uint8Array)]))
		.optional(),
	textBlobBindings: z.record(z.string(), z.string()).optional(),
	dataBlobBindings: z
		.record(z.string(), z.union([z.string(), z.instanceof(Uint8Array)]))
		.optional(),
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
	dev: DevConfigSchema.optional(),
});

export type WorkerOptions = z.input<typeof WorkerOptionsSchema>;

/**
 * A single fully-parsed worker's options, as passed to plugin methods.
 */
export type ParsedWorkerOptions = z.output<typeof WorkerOptionsSchema>;

// ---------------------------------------------------------------------------
//  Instance-wide options
// ---------------------------------------------------------------------------

export const InstanceOptionsSchema = z.object({
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
	resourcePersistencePath: z.string().optional(),
	resourceTmpPath: z.string().optional(),

	containerEngine: z
		.union([
			z.string(),
			z.object({
				localDocker: z.object({
					socketPath: z.string(),
				}),
			}),
		])
		.optional(),

	// Telemetry
	telemetry: z
		.object({
			enabled: z.boolean().default(false),
			deviceId: z.string().optional(),
		})
		.default({ enabled: false }),

	// Internal
	publicUrl: z.url().optional(),
	unsafeDevRegistryPath: z.string().optional(),
	unsafeHandleDevRegistryUpdate: z
		.custom<(registry: WorkerRegistry) => void>()
		.optional(),
	unsafeProxySharedSecret: z.string().optional(),
	unsafeModuleFallbackService: z
		.custom<(request: Request, miniflare: Miniflare) => Awaitable<Response>>()
		.optional(),
	unsafeTriggerHandlers: z.boolean().optional(),
	unsafeRuntimeEnv: z.record(z.string(), z.string()).optional(),
	unsafeLocalExplorer: z.boolean().optional(),
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
});

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
 * proxied remotely iff `binding.remote === true` _and_
 * `dev.remoteProxyConnectionString` is set (mirroring wrangler's model).
 */
export function getRemoteProxyConnectionString(
	binding: { remote?: boolean },
	dev: ParsedDevConfig | undefined
): RemoteProxyConnectionString | undefined {
	return binding.remote && dev?.remoteProxyConnectionString
		? dev.remoteProxyConnectionString
		: undefined;
}
