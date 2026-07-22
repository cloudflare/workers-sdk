import {
	BrowserBindingSchema,
	DurableObjectCreatedExportSchema,
	ExportSchema,
	KnownBindingSchema,
	ModuleTypeSchema,
	OutputWorkerSchema,
	UnsafeBindingSchema,
	WorkerBindingSchema,
} from "@cloudflare/config";
import { z } from "zod";
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

/**
 * Extended browser binding with `headful` (local-only, so not in config schema).
 */
const MiniflareBrowserBindingSchema = BrowserBindingSchema.extend({
	headful: z.boolean().optional(),
});

const MiniflareKnownBindingSchema = z.discriminatedUnion("type", [
	MiniflareBrowserBindingSchema,
	FetcherBindingSchema,
	NodeHandlerBindingSchema,
	...KnownBindingSchema.options.filter(
		(option) => option !== BrowserBindingSchema
	),
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
const MiniflareDurableObjectExportSchema =
	DurableObjectCreatedExportSchema.extend({
		unsafeUniqueKey: z.custom<UnsafeUniqueKey>().optional(),
		unsafePreventEviction: z.boolean().optional(),
		container: z.custom<DOContainerOptions>().optional(),
	});

const MiniflareExportSchema = z.union([
	MiniflareDurableObjectExportSchema,
	...ExportSchema.options.filter(
		(option) => option !== DurableObjectCreatedExportSchema
	),
]);

// ---------------------------------------------------------------------------
// Worker config schema (extends OutputWorkerSchema)
// ---------------------------------------------------------------------------

const MiniflareWorkerConfigSchema = OutputWorkerSchema.omit({
	manifest: true,
	env: true,
	exports: true,
}).extend({
	manifest: MiniflareManifestSchema.optional(),
	env: z.record(z.string(), MiniflareBindingSchema).optional(),
	exports: z.record(z.string(), MiniflareExportSchema).optional(),
});

export type MiniflareWorkerConfig = z.input<typeof MiniflareWorkerConfigSchema>;

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
 * The outbound service intercepts a worker's outgoing `fetch()` subrequests, so
 * it only accepts fetch-style handlers: a function-backed `fetcher` binding or a
 * `worker` service binding.
 */
const OutboundServiceSchema = z.discriminatedUnion("type", [
	FetcherBindingSchema,
	WorkerBindingSchema,
]);

const DevConfigSchema = z.strictObject({
	disableCache: z.boolean().optional(),
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
});

export type DevConfig = z.input<typeof DevConfigSchema>;

// ---------------------------------------------------------------------------
// Legacy config (service-worker format, Workers Sites)
// ---------------------------------------------------------------------------

const LegacyConfigSchema = z.strictObject({
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

// ---------------------------------------------------------------------------
// Final Miniflare Schema
// ---------------------------------------------------------------------------

export const MiniflareOptionsSchema = InstanceOptionsSchema.extend({
	workers: z.array(WorkerOptionsSchema),
});

export type MiniflareOptions = z.input<typeof MiniflareOptionsSchema>;
