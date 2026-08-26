import * as z from "zod";
import type { SendEmailBinding, VpcNetworkBinding } from "./bindings";
import type { SettingsConfig, WorkerConfig } from "./types";

const RemoteBindingDevSchema = z.strictObject({
	remote: z.boolean().optional(),
});

export const AssetsSchema = z.strictObject({
	htmlHandling: z
		.enum([
			"auto-trailing-slash",
			"drop-trailing-slash",
			"force-trailing-slash",
			"none",
		])
		.optional(),
	notFoundHandling: z
		.enum(["single-page-application", "404-page", "none"])
		.optional(),
	runWorkerFirst: z.union([z.array(z.string()), z.boolean()]).optional(),
});

export const BrowserBindingSchema = z.strictObject({
	type: z.literal("browser"),
	dev: RemoteBindingDevSchema.optional(),
});

export const WorkerBindingSchema = z.strictObject({
	type: z.literal("worker"),
	workerName: z.string(),
	exportName: z.string().optional(),
	props: z.record(z.string(), z.unknown()).optional(),
	dev: RemoteBindingDevSchema.optional(),
});

export const D1BindingSchema = z.strictObject({
	type: z.literal("d1"),
	name: z.string().optional(),
	id: z.string().optional(),
	dev: RemoteBindingDevSchema.optional(),
});

export const KVBindingSchema = z.strictObject({
	type: z.literal("kv"),
	id: z.string().optional(),
	// TODO: name support not yet implemented
	// name: z.string().optional(),
	dev: RemoteBindingDevSchema.optional(),
});

export const QueueBindingSchema = z.strictObject({
	type: z.literal("queue"),
	name: z.string().optional(),
	deliveryDelay: z.number().optional(),
	dev: RemoteBindingDevSchema.optional(),
});

export const R2BindingSchema = z.strictObject({
	type: z.literal("r2"),
	name: z.string().optional(),
	jurisdiction: z.string().optional(),
	dev: RemoteBindingDevSchema.extend({
		experimentalS3Credentials: z
			// AWS SDK may add additional keys as internal metadata like `$source`.
			.object({
				accessKeyId: z.string(),
				secretAccessKey: z.string(),
			})
			.optional(),
	}).optional(),
});

export const AnalyticsEngineDatasetBindingSchema = z.strictObject({
	type: z.literal("analytics-engine-dataset"),
	name: z.string().optional(),
});

export const FlagshipBindingSchema = z.strictObject({
	type: z.literal("flagship"),
	id: z.string().optional(),
	dev: RemoteBindingDevSchema.optional(),
});

export const HyperdriveBindingSchema = z.strictObject({
	type: z.literal("hyperdrive"),
	id: z.string(),
	dev: z.strictObject({ connectionString: z.string().optional() }).optional(),
});

export const KnownBindingSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("agent-memory"),
		namespace: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({
		type: z.literal("ai"),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({
		type: z.literal("ai-search"),
		name: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({
		type: z.literal("ai-search-namespace"),
		namespace: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	AnalyticsEngineDatasetBindingSchema,
	z.strictObject({
		type: z.literal("artifacts"),
		namespace: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({ type: z.literal("assets") }),
	BrowserBindingSchema,
	D1BindingSchema,
	z.strictObject({
		type: z.literal("dispatch-namespace"),
		namespace: z.string().optional(),
		outbound: z
			.strictObject({
				workerName: z.string(),
				parameters: z.array(z.string()).optional(),
			})
			.optional(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({
		type: z.literal("durable-object"),
		workerName: z.string(),
		exportName: z.string(),
	}),
	FlagshipBindingSchema,
	HyperdriveBindingSchema,
	z.strictObject({
		type: z.literal("images"),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({ type: z.literal("json"), value: z.json() }),
	KVBindingSchema,
	z.strictObject({ type: z.literal("logfwdr"), destination: z.string() }),
	z.strictObject({
		type: z.literal("media"),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({
		type: z.literal("mtls-certificate"),
		id: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({
		type: z.literal("pipeline"),
		name: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	QueueBindingSchema,
	z.strictObject({
		type: z.literal("rate-limit"),
		namespace: z.string(),
		simple: z.strictObject({
			limit: z.number(),
			period: z.union([z.literal(10), z.literal(60)]),
		}),
	}),
	R2BindingSchema,
	z.strictObject({ type: z.literal("secret") }),
	z.strictObject({
		type: z.literal("secrets-store-secret"),
		storeId: z.string(),
		secretName: z.string(),
	}),
	z
		.strictObject({
			type: z.literal("send-email"),
			destinationAddress: z.string().optional(),
			allowedDestinationAddresses: z.array(z.string()).optional(),
			allowedSenderAddresses: z.array(z.string()).optional(),
			dev: RemoteBindingDevSchema.optional(),
		})
		.refine(
			(value): value is SendEmailBinding =>
				value.destinationAddress === undefined ||
				value.allowedDestinationAddresses === undefined,
			{
				message:
					'"send-email" bindings cannot specify both "destinationAddress" and "allowedDestinationAddresses"',
			}
		),
	z.strictObject({
		type: z.literal("stream"),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({ type: z.literal("text"), value: z.string() }),
	z.strictObject({
		type: z.literal("vectorize"),
		name: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z.strictObject({ type: z.literal("version-metadata") }),
	z.strictObject({
		type: z.literal("vpc-service"),
		id: z.string(),
		dev: RemoteBindingDevSchema.optional(),
	}),
	z
		.strictObject({
			type: z.literal("vpc-network"),
			tunnelId: z.string().optional(),
			networkId: z.string().optional(),
			dev: RemoteBindingDevSchema.optional(),
		})
		.refine(
			(value): value is VpcNetworkBinding =>
				(value.tunnelId !== undefined) !== (value.networkId !== undefined),
			{
				error: ({ input }) => {
					const value = input as {
						tunnelId?: string;
						networkId?: string;
					};
					return value.tunnelId !== undefined && value.networkId !== undefined
						? `"vpc-network" bindings must specify exactly one of "tunnelId" or "networkId", not both`
						: `"vpc-network" bindings must specify either "tunnelId" or "networkId"`;
				},
			}
		),
	z.strictObject({
		type: z.literal("web-search"),
		dev: RemoteBindingDevSchema.optional(),
	}),
	WorkerBindingSchema,
	z.strictObject({ type: z.literal("worker-loader") }),
	// TODO: support Workflows
	// z.strictObject({
	// 	type: z.literal("workflow"),
	// 	workerName: z.string(),
	// 	exportName: z.string(),
	// }),
]);

export const UnsafeBindingSchema = z.looseObject({
	type: z.templateLiteral(["unsafe:", z.string().min(1)]),
	dev: z
		.strictObject({
			plugin: z.strictObject({
				package: z.string(),
				name: z.string(),
			}),
			options: z.record(z.string(), z.unknown()).optional(),
		})
		.optional(),
});

type BindingInput =
	| z.input<typeof KnownBindingSchema>
	| z.input<typeof UnsafeBindingSchema>;
type BindingOutput =
	| z.output<typeof KnownBindingSchema>
	| z.output<typeof UnsafeBindingSchema>;

export const BindingSchema = z.unknown().transform((value, ctx) => {
	const isUnsafe =
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof value.type === "string" &&
		value.type.startsWith("unsafe:");

	const schema = isUnsafe ? UnsafeBindingSchema : KnownBindingSchema;
	const result = schema.safeParse(value);

	if (!result.success) {
		ctx.issues.push(...(result.error.issues as unknown as typeof ctx.issues));
		return z.NEVER;
	}

	return result.data;
}) as z.ZodType<BindingOutput, BindingInput>;

export function isParsedUnsafeBinding(
	binding: BindingOutput
): binding is z.output<typeof UnsafeBindingSchema> {
	return binding.type.startsWith("unsafe:");
}

const CacheSchema = z.strictObject({
	enabled: z.boolean(),
	crossVersionCache: z.boolean().optional(),
});

/**
 * Binding types that can only be defined once per worker.
 */
const SINGLETON_BINDING_TYPES = new Set([
	"ai",
	"assets",
	"browser",
	"images",
	"media",
	"stream",
	"version-metadata",
	"web-search",
]);

const listFormatter = new Intl.ListFormat("en-US");

export function validateSingletonBindings(
	env: Record<string, { type: string }>,
	ctx: z.RefinementCtx
) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const binding of Object.values(env)) {
		const type = binding.type;

		if (SINGLETON_BINDING_TYPES.has(type)) {
			if (seen.has(type)) {
				duplicates.add(type);
			}

			seen.add(type);
		}
	}

	if (duplicates.size > 0) {
		ctx.addIssue({
			code: "custom",
			message: `${listFormatter.format([...duplicates].sort())} bindings can only be defined once`,
		});
	}
}

const EnvSchema = z
	.record(z.string(), BindingSchema)
	.superRefine(validateSingletonBindings)
	.optional();

// `state` defaults to `"created"` (live) when omitted. Tombstones use one of
// `"deleted"`, `"renamed"`, `"transferred"`; `"expecting-transfer"` is a live
// entry awaiting incoming data via the two-phase cross-script transfer flow.
export const DurableObjectCreatedExportSchema = z.strictObject({
	type: z.literal("durable-object"),
	state: z.literal("created").optional(),
	storage: z.enum(["sqlite", "legacy-kv"]),
	container: z.string().optional(),
});

export const DurableObjectDeletedExportSchema = z.strictObject({
	type: z.literal("durable-object"),
	state: z.literal("deleted"),
});

export const DurableObjectRenamedExportSchema = z.strictObject({
	type: z.literal("durable-object"),
	state: z.literal("renamed"),
	renamedTo: z.string(),
});

export const DurableObjectTransferredExportSchema = z.strictObject({
	type: z.literal("durable-object"),
	state: z.literal("transferred"),
	transferredTo: z.string(),
});

export const DurableObjectExpectingTransferExportSchema = z.strictObject({
	type: z.literal("durable-object"),
	state: z.literal("expecting-transfer"),
	storage: z.enum(["sqlite", "legacy-kv"]),
	transferFrom: z.string(),
	container: z.string().optional(),
});

export const WorkerEntrypointExportSchema = z.strictObject({
	type: z.literal("worker"),
	cache: z.strictObject({ enabled: z.boolean() }).optional(),
});

// Containers are only supported on the SQLite storage engine, so each live
// variant enters the union split by `storage`: `container` exists on the
// `sqlite` branch and is absent from the `legacy-kv` one. Splitting rather than
// validating the pair keeps the inferred type honest, so `container` on a
// `legacy-kv` export is a type error and not just a parse failure. The branches
// are derived from the exported variants above, which stay unsplit so that
// consumers such as miniflare can keep extending them as single objects.
const DurableObjectCreatedSqliteExportSchema =
	DurableObjectCreatedExportSchema.extend({ storage: z.literal("sqlite") });
const DurableObjectCreatedLegacyKvExportSchema =
	DurableObjectCreatedExportSchema.omit({ container: true }).extend({
		storage: z.literal("legacy-kv"),
	});
const DurableObjectExpectingTransferSqliteExportSchema =
	DurableObjectExpectingTransferExportSchema.extend({
		storage: z.literal("sqlite"),
	});
const DurableObjectExpectingTransferLegacyKvExportSchema =
	DurableObjectExpectingTransferExportSchema.omit({ container: true }).extend({
		storage: z.literal("legacy-kv"),
	});

export const ExportSchema = z.union([
	DurableObjectCreatedSqliteExportSchema,
	DurableObjectCreatedLegacyKvExportSchema,
	DurableObjectDeletedExportSchema,
	DurableObjectRenamedExportSchema,
	DurableObjectTransferredExportSchema,
	DurableObjectExpectingTransferSqliteExportSchema,
	DurableObjectExpectingTransferLegacyKvExportSchema,
	WorkerEntrypointExportSchema,
	// TODO: support Workflows
	// z.strictObject({
	// 	type: z.literal("workflow"),
	// 	name: z.string(),
	// 	limits: z.strictObject({ steps: z.number().optional() }).optional(),
	// }),
]);

const LimitsSchema = z.strictObject({
	cpuMs: z.number().optional(),
	subrequests: z.number().optional(),
});

const ObservabilitySchema = z.strictObject({
	enabled: z.boolean().optional(),
	headSamplingRate: z.number().optional(),
	logs: z
		.strictObject({
			enabled: z.boolean().optional(),
			headSamplingRate: z.number().optional(),
			invocationLogs: z.boolean().optional(),
			persist: z.boolean().optional(),
			destinations: z.array(z.string()).optional(),
		})
		.optional(),
	traces: z
		.strictObject({
			enabled: z.boolean().optional(),
			headSamplingRate: z.number().optional(),
			persist: z.boolean().optional(),
			destinations: z.array(z.string()).optional(),
		})
		.optional(),
});

const PlacementSchema = z.union([
	z.strictObject({
		mode: z.enum(["off", "smart"]),
		hint: z.string().optional(),
	}),
	z.strictObject({
		mode: z.literal("targeted").optional(),
		region: z.string(),
	}),
	z.strictObject({
		mode: z.literal("targeted").optional(),
		host: z.string(),
	}),
	z.strictObject({
		mode: z.literal("targeted").optional(),
		hostname: z.string(),
	}),
]);

export const TailConsumerSchema = z.strictObject({
	workerName: z.string(),
	streaming: z.boolean().optional(),
});

const TriggerSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("email"),
		addresses: z.array(z.string()),
	}),
	z.strictObject({
		type: z.literal("fetch"),
		pattern: z.string(),
		zone: z.string().optional(),
	}),
	z.strictObject({
		type: z.literal("queue"),
		name: z.string(),
		deadLetterQueue: z.string().optional(),
		maxBatchSize: z.number().optional(),
		maxBatchTimeout: z.number().optional(),
		maxConcurrency: z.number().nullable().optional(),
		maxRetries: z.number().optional(),
		retryDelay: z.number().optional(),
		visibilityTimeoutMs: z.number().optional(),
	}),
	z.strictObject({
		type: z.literal("scheduled"),
		schedule: z.string(),
	}),
	z.strictObject({
		type: z.literal("connect"),
		protocol: z.enum(["tcp"]),
		port: z.number(),
		address: z.string().optional(),
	}),
]);

const UnsafeSchema = z.strictObject({
	metadata: z.record(z.string(), z.unknown()).optional(),
	capnp: z
		.union([
			z.strictObject({
				basePath: z.string(),
				sourceSchemas: z.array(z.string()),
				compiledSchema: z.never().optional(),
			}),
			z.strictObject({
				basePath: z.never().optional(),
				sourceSchemas: z.never().optional(),
				compiledSchema: z.string(),
			}),
		])
		.optional(),
});

/**
 * Base Worker schema — the set of fields shared between the input
 * (user-authored) and output (on-disk) Worker configs.
 */
const BaseWorkerSchema = z.strictObject({
	type: z.literal("worker"),
	name: z.string(),
	compatibilityDate: z.string(),
	compatibilityFlags: z.array(z.string()).optional(),
	assets: AssetsSchema.optional(),
	domains: z.array(z.string()).optional(),
	triggers: z.array(TriggerSchema).optional(),
	tailConsumers: z.array(TailConsumerSchema).optional(),
	cache: CacheSchema.optional(),
	placement: PlacementSchema.optional(),
	limits: LimitsSchema.optional(),
	logpush: z.boolean().optional(),
	observability: ObservabilitySchema.optional(),
	workersDev: z.boolean().optional(),
	previewUrls: z.boolean().optional(),
	firstPartyWorker: z.boolean().optional(),
	unsafe: UnsafeSchema.optional(),
	// TODO: support previews
	env: EnvSchema,
	exports: z.record(z.string(), ExportSchema).optional(),
});

/**
 * Input Worker schema — the shape that user-authored `cloudflare.config.ts`
 * files are validated against. Adds an optional `entrypoint` field to the
 * base schema.
 */
export const InputWorkerSchema = BaseWorkerSchema.extend({
	entrypoint: z
		.union([z.string(), z.strictObject({ default: z.string() })])
		.transform((value) => (typeof value === "string" ? value : value.default))
		.optional(),
});

export type ParsedInputWorkerConfig = z.output<typeof InputWorkerSchema>;

/**
 * Input settings schema — validates the named `settings` export of a
 * `cloudflare.config.ts`. Holds account/deployment settings shared by the other exports.
 */
export const InputSettingsSchema = z.strictObject({
	type: z.literal("settings"),
	accountId: z.string().optional(),
	complianceRegion: z.enum(["public", "fedramp-high"]).optional(),
});

export type ParsedInputSettingsConfig = z.output<typeof InputSettingsSchema>;

/**
 * Output settings schema — the shape of the top-level `config.json` in the
 * Build Output Specification. Adds the `mode` the build was produced in.
 */
export const OutputSettingsSchema = InputSettingsSchema.extend({
	mode: z.string().optional(),
});

export type ParsedOutputSettingsConfig = z.output<typeof OutputSettingsSchema>;

const SETTINGS_EXPORT_NAME = "settings";
const SUPPORTED_EXPORT_TYPES = new Set(["worker", "settings"]);

function invalidConfigExportMessage(exportName: string): string {
	return `The \`${exportName}\` export is not a supported export type. Move constants, helper functions, and other unsupported exports to a separate module.`;
}

const ConfigExportsTypeSchema = z
	.record(z.string(), z.unknown())
	.check((ctx) => {
		for (const [key, value] of Object.entries(ctx.value)) {
			const isObject = typeof value === "object" && value !== null;
			const type = isObject && "type" in value ? value.type : undefined;
			if (typeof type !== "string" || !SUPPORTED_EXPORT_TYPES.has(type)) {
				ctx.issues.push({
					code: "custom",
					input: value,
					path: isObject ? [key, "type"] : [key],
					message: invalidConfigExportMessage(key),
				});
				continue;
			}

			const isSettingsName = key === SETTINGS_EXPORT_NAME;
			const isSettingsType = type === "settings";
			if (isSettingsType && !isSettingsName) {
				ctx.issues.push({
					code: "custom",
					input: value,
					path: [key],
					message: `A \`settings\` config is only allowed on the \`${SETTINGS_EXPORT_NAME}\` export; found one on the \`${key}\` export.`,
				});
			} else if (isSettingsName && !isSettingsType) {
				ctx.issues.push({
					code: "custom",
					input: value,
					path: [key],
					message: `The \`${SETTINGS_EXPORT_NAME}\` export is reserved for a \`settings\` config; found a \`${type}\` config.`,
				});
			}
		}
	});

const ConfigExportsObjectSchema = z
	.object({
		settings: InputSettingsSchema.optional(),
	})
	.catchall(InputWorkerSchema);

/**
 * Schema for the resolved config exports, keyed by export
 * name. Each value is discriminated on its `type` field. Reserves the
 * `settings` export name exclusively for settings configs: a `settings`
 * config must live on the `settings` export, and the `settings` export
 * may only hold a `settings` config.
 */
export const ConfigExportsSchema = ConfigExportsTypeSchema.pipe(
	ConfigExportsObjectSchema
);

export type ParsedConfigExports = z.output<typeof ConfigExportsSchema>;

export const ModuleTypeSchema = z.enum([
	"esm",
	"cjs",
	"python",
	"python-requirement",
	"wasm",
	"text",
	"data",
	"json",
	"sourcemap",
]);

export type ModuleType = z.output<typeof ModuleTypeSchema>;

const ManifestSchema = z.strictObject({
	mainModule: z.string(),
	modules: z.record(z.string(), z.strictObject({ type: ModuleTypeSchema })),
});

/**
 * Output Worker schema — the shape of the Worker's `config.json` in the
 * Build Output Specification. Adds an optional `manifest` field to the
 * base schema.
 */
export const OutputWorkerSchema = BaseWorkerSchema.extend({
	manifest: ManifestSchema.optional(),
});

export type ParsedOutputWorkerConfig = z.output<typeof OutputWorkerSchema>;

/**
 * Bidirectional drift check between {@link InputWorkerSchema} and the
 * public {@link WorkerConfig} interface. Excludes `entrypoint` and `env`,
 * which deliberately differ:
 *
 * - `entrypoint`: the public type accepts a `WorkerModule` namespace
 *   (produced by `import ... with { type: "cf-worker" }`), but the schema
 *   only accepts the post-`load.ts` shape (`string` or `{ default: string }`).
 *
 * - `env`: see the separate unidirectional drift check below.
 */
type _ComparableInput = Omit<
	z.input<typeof InputWorkerSchema>,
	"entrypoint" | "env"
>;
type _ComparableWorkerConfig = Omit<WorkerConfig, "entrypoint" | "env">;
type _AssertSchemaMatchesWorkerConfig = [
	_ComparableInput extends _ComparableWorkerConfig ? true : false,
	_ComparableWorkerConfig extends _ComparableInput ? true : false,
];
const _assertSchemaMatchesWorkerConfig: _AssertSchemaMatchesWorkerConfig = [
	true,
	true,
];
void _assertSchemaMatchesWorkerConfig;

/**
 * Drift checks between the schema and public `env` types. Schema input is
 * intentionally broader for bindings with cross-field validation, so only
 * assert that every public binding is accepted as input. After parsing, the
 * schema output and public types should match bidirectionally.
 *
 * These checks catch fields or bindings that are missing, renamed, or typed
 * differently between the public definitions and the schema.
 */
type _AssertSchemaEnvMatchesWorkerConfig = [
	WorkerConfig["env"] extends z.input<typeof InputWorkerSchema>["env"]
		? true
		: false,
	z.output<typeof InputWorkerSchema>["env"] extends WorkerConfig["env"]
		? true
		: false,
	WorkerConfig["env"] extends z.output<typeof InputWorkerSchema>["env"]
		? true
		: false,
];
const _assertSchemaEnvMatchesWorkerConfig: _AssertSchemaEnvMatchesWorkerConfig =
	[true, true, true];
void _assertSchemaEnvMatchesWorkerConfig;

/**
 * Bidirectional drift check between {@link InputSettingsSchema} and the public
 * {@link SettingsConfig} interface.
 */
type _AssertInputSettingsSchemaMatchesConfig = [
	z.input<typeof InputSettingsSchema> extends SettingsConfig ? true : false,
	SettingsConfig extends z.input<typeof InputSettingsSchema> ? true : false,
];
const _assertInputSettingsSchemaMatchesConfig: _AssertInputSettingsSchemaMatchesConfig =
	[true, true];
void _assertInputSettingsSchemaMatchesConfig;
