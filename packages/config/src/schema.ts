import * as z from "zod";
import type { UserConfig } from "./types";

const AssetsSchema = z.strictObject({
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

const KnownBindingSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("agent-memory"),
		namespace: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("ai"), remote: z.boolean().optional() }),
	z.strictObject({
		type: z.literal("ai-search"),
		name: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("ai-search-namespace"),
		namespace: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("analytics-engine-dataset"),
		name: z.string().optional(),
	}),
	z.strictObject({
		type: z.literal("artifacts"),
		namespace: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("assets") }),
	z.strictObject({
		type: z.literal("browser"),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("d1"),
		name: z.string().optional(),
		id: z.string().optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("dispatch-namespace"),
		namespace: z.string(),
		outbound: z
			.strictObject({
				workerName: z.string(),
				parameters: z.array(z.string()).optional(),
			})
			.optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("durable-object"),
		workerName: z.string(),
		exportName: z.string(),
	}),
	z.strictObject({
		type: z.literal("flagship"),
		id: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("hyperdrive"),
		id: z.string(),
		localConnectionString: z.string().optional(),
	}),
	z.strictObject({
		type: z.literal("images"),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("json"), value: z.json() }),
	z.strictObject({
		type: z.literal("kv"),
		id: z.string().optional(),
		// TODO: name support not yet implemented
		// name: z.string().optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("logfwdr"), destination: z.string() }),
	z.strictObject({
		type: z.literal("media"),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("mtls-certificate"),
		id: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("pipeline"),
		name: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("queue"),
		name: z.string(),
		deliveryDelay: z.number().optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("rate-limit"),
		namespace: z.string(),
		simple: z.strictObject({
			limit: z.number(),
			period: z.union([z.literal(10), z.literal(60)]),
		}),
	}),
	z.strictObject({
		type: z.literal("r2"),
		name: z.string().optional(),
		jurisdiction: z.string().optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("secret") }),
	z.strictObject({
		type: z.literal("secrets-store-secret"),
		storeId: z.string(),
		secretName: z.string(),
	}),
	z.strictObject({
		type: z.literal("send-email"),
		destinationAddress: z.string().optional(),
		allowedDestinationAddresses: z.array(z.string()).optional(),
		allowedSenderAddresses: z.array(z.string()).optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("stream"),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("text"), value: z.string() }),
	z.strictObject({
		type: z.literal("vectorize"),
		name: z.string(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("version-metadata") }),
	z.strictObject({
		type: z.literal("vpc-service"),
		id: z.string(),
		remote: z.boolean().optional(),
	}),
	z
		.strictObject({
			type: z.literal("vpc-network"),
			tunnelId: z.string().optional(),
			networkId: z.string().optional(),
			remote: z.boolean().optional(),
		})
		.superRefine((value, ctx) => {
			const hasTunnel = value.tunnelId !== undefined;
			const hasNetwork = value.networkId !== undefined;
			if (hasTunnel === hasNetwork) {
				ctx.addIssue({
					code: "custom",
					message: hasTunnel
						? `"vpc-network" bindings must specify exactly one of "tunnelId" or "networkId", not both`
						: `"vpc-network" bindings must specify either "tunnelId" or "networkId"`,
				});
			}
		}),
	z.strictObject({
		type: z.literal("web-search"),
		remote: z.boolean().optional(),
	}),
	z.strictObject({
		type: z.literal("worker"),
		workerName: z.string(),
		exportName: z.string().optional(),
		props: z.record(z.string(), z.unknown()).optional(),
		remote: z.boolean().optional(),
	}),
	z.strictObject({ type: z.literal("worker-loader") }),
	// TODO: support Workflows
	// z.strictObject({
	// 	type: z.literal("workflow"),
	// 	workerName: z.string(),
	// 	exportName: z.string(),
	// 	remote: z.boolean().optional(),
	// }),
]);

const UnsafeBindingSchema = z.looseObject({
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

const BindingSchema = z.unknown().transform((value, ctx) => {
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

const EnvSchema = z
	.record(z.string(), BindingSchema)
	.superRefine((env, ctx) => {
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
	})
	.optional();

const ExportSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("durable-object"),
		storage: z.enum(["sqlite", "legacy-kv"]),
	}),
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

const TailConsumerSchema = z.strictObject({
	workerName: z.string(),
	streaming: z.boolean().optional(),
});

const TriggerSchema = z.discriminatedUnion("type", [
	// TODO: email triggers not yet implemented
	// z.strictObject({ type: z.literal("email") }),
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
	name: z.string(),
	accountId: z.string().optional(),
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
	complianceRegion: z.enum(["public", "fedramp-high"]).optional(),
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

export const ModuleTypeSchema = z.enum([
	"esm",
	"cjs",
	"python",
	"pythonRequirement",
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
 * Output Worker schema — the shape of `worker.config.json` in the
 * Build Output API. Adds an optional `manifest` field to the
 * base schema.
 */
export const OutputWorkerSchema = BaseWorkerSchema.extend({
	manifest: ManifestSchema.optional(),
});

export type ParsedOutputWorkerConfig = z.output<typeof OutputWorkerSchema>;

/**
 * Bidirectional drift check between {@link InputWorkerSchema} and the
 * public {@link UserConfig} interface. Excludes `entrypoint` and `env`,
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
type _ComparableUserConfig = Omit<UserConfig, "entrypoint" | "env">;
type _AssertSchemaMatchesUserConfig = [
	_ComparableInput extends _ComparableUserConfig ? true : false,
	_ComparableUserConfig extends _ComparableInput ? true : false,
];
const _assertSchemaMatchesUserConfig: _AssertSchemaMatchesUserConfig = [
	true,
	true,
];
void _assertSchemaMatchesUserConfig;

/**
 * Unidirectional drift check for `env`. The public binding return types
 * (e.g. `AiBinding`) carry phantom `__typeParams` / `__config` fields for
 * inference helpers that the schema does not (and cannot) validate at
 * runtime, so a bidirectional check would always fail in that direction.
 *
 * We therefore only assert that `UserConfig['env']` is assignable to
 * `z.input<typeof InputWorkerSchema>['env']` — i.e. every binding shape
 * the public type accepts is something the schema is willing to parse.
 * This catches drift where the public type drops a field the schema
 * still requires, renames a field, changes a field's type to one the
 * schema rejects, or adds a binding the schema doesn't know about.
 */
type _AssertUserConfigEnvExtendsSchema = UserConfig["env"] extends z.input<
	typeof InputWorkerSchema
>["env"]
	? true
	: false;
const _assertUserConfigEnvExtendsSchema: _AssertUserConfigEnvExtendsSchema = true;
void _assertUserConfigEnvExtendsSchema;
