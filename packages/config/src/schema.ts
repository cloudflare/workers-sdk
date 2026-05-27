import * as z from "zod";
import type { UserConfig } from "./types";

const AssetsSchema = z.object({
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

const BindingSchema = z.union([
	z.object({ type: z.literal("ai"), remote: z.boolean().optional() }),
	z.object({
		type: z.literal("ai-search"),
		name: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("ai-search-namespace"),
		namespace: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("analytics-engine-dataset"),
		name: z.string().optional(),
	}),
	z.object({
		type: z.literal("artifacts"),
		namespace: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({ type: z.literal("assets") }),
	z.object({ type: z.literal("browser"), remote: z.boolean().optional() }),
	z.object({
		type: z.literal("d1"),
		name: z.string().optional(),
		id: z.string().optional(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("dispatch-namespace"),
		namespace: z.string(),
		outbound: z
			.object({
				workerName: z.string(),
				parameters: z.array(z.string()).optional(),
			})
			.optional(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("durable-object"),
		workerName: z.string(),
		exportName: z.string(),
	}),
	z.object({
		type: z.literal("flagship"),
		id: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("hyperdrive"),
		id: z.string(),
		localConnectionString: z.string().optional(),
	}),
	z.object({ type: z.literal("images"), remote: z.boolean().optional() }),
	z.object({ type: z.literal("json"), value: z.json() }),
	z.object({
		type: z.literal("kv"),
		id: z.string().optional(),
		// TODO: name support not yet implemented
		// name: z.string().optional(),
		remote: z.boolean().optional(),
	}),
	z.object({ type: z.literal("logfwdr"), destination: z.string() }),
	z.object({ type: z.literal("media"), remote: z.boolean().optional() }),
	z.object({
		type: z.literal("mtls-certificate"),
		id: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("pipeline"),
		name: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("queue"),
		name: z.string(),
		deliveryDelay: z.number().optional(),
		remote: z.boolean().optional(),
	}),
	z.object({
		type: z.literal("rate-limit"),
		namespace: z.string(),
		simple: z.object({
			limit: z.number(),
			period: z.union([z.literal(10), z.literal(60)]),
		}),
	}),
	z.object({
		type: z.literal("r2"),
		name: z.string().optional(),
		jurisdiction: z.string().optional(),
		remote: z.boolean().optional(),
	}),
	z.object({ type: z.literal("secret") }),
	z.object({
		type: z.literal("secrets-store-secret"),
		storeId: z.string(),
		secretName: z.string(),
	}),
	z.object({
		type: z.literal("send-email"),
		destinationAddress: z.string().optional(),
		allowedDestinationAddresses: z.array(z.string()).optional(),
		allowedSenderAddresses: z.array(z.string()).optional(),
		remote: z.boolean().optional(),
	}),
	z.object({ type: z.literal("stream"), remote: z.boolean().optional() }),
	z.object({ type: z.literal("text"), value: z.string() }),
	z.object({
		type: z.literal("unsafe"),
		value: z.looseObject({
			type: z.string(),
			dev: z
				.object({
					plugin: z.object({
						package: z.string(),
						name: z.string(),
					}),
					options: z.record(z.string(), z.unknown()).optional(),
				})
				.optional(),
		}),
	}),
	z.object({
		type: z.literal("vectorize"),
		name: z.string(),
		remote: z.boolean().optional(),
	}),
	z.object({ type: z.literal("version-metadata") }),
	z.object({
		type: z.literal("vpc-service"),
		id: z.string(),
		remote: z.boolean().optional(),
	}),
	z.intersection(
		z.object({
			type: z.literal("vpc-network"),
			remote: z.boolean().optional(),
		}),
		z.union([
			z.object({ tunnelId: z.string() }),
			z.object({ networkId: z.string() }),
		])
	),
	z.object({
		type: z.literal("worker"),
		workerName: z.string(),
		exportName: z.string().optional(),
		props: z.record(z.string(), z.unknown()).optional(),
		remote: z.boolean().optional(),
	}),
	z.object({ type: z.literal("worker-loader") }),
	// TODO: workflow bindings are temporarily disabled. Workflows are defined
	// via the top-level `exports` field, which produces a same-Worker
	// `workflows` entry in the Wrangler config.
	// z.object({
	// 	type: z.literal("workflow"),
	// 	workerName: z.string(),
	// 	exportName: z.string(),
	// 	remote: z.boolean().optional(),
	// }),
]);

const CacheSchema = z.object({
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
]);

/**
 * Formats a list of items as natural language.
 * - 1 item: "ai"
 * - 2 items: "ai and assets"
 * - 3+ items: "ai, assets, and browser"
 */
function formatList(items: string[]): string {
	if (items.length === 1) {
		return `${items[0]}`;
	}

	if (items.length === 2) {
		return `${items[0]} and ${items[1]}`;
	}

	return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

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
				message: `${formatList([...duplicates].sort())} bindings can only be defined once`,
			});
		}
	})
	.optional();

const ExportSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("durable-object"),
		storage: z.enum(["sqlite", "legacy-kv"]),
	}),
	z.object({
		type: z.literal("workflow"),
		name: z.string(),
		limits: z.object({ steps: z.number().optional() }).optional(),
	}),
]);

const LimitsSchema = z.object({
	cpuMs: z.number().optional(),
	subrequests: z.number().optional(),
});

const ObservabilitySchema = z.object({
	enabled: z.boolean().optional(),
	headSamplingRate: z.number().optional(),
	logs: z
		.object({
			enabled: z.boolean().optional(),
			headSamplingRate: z.number().optional(),
			invocationLogs: z.boolean().optional(),
			persist: z.boolean().optional(),
			destinations: z.array(z.string()).optional(),
		})
		.optional(),
	traces: z
		.object({
			enabled: z.boolean().optional(),
			headSamplingRate: z.number().optional(),
			persist: z.boolean().optional(),
			destinations: z.array(z.string()).optional(),
		})
		.optional(),
});

const PlacementSchema = z.union([
	z.object({
		mode: z.enum(["off", "smart"]),
		hint: z.string().optional(),
	}),
	z.object({
		mode: z.literal("targeted").optional(),
		region: z.string(),
	}),
	z.object({
		mode: z.literal("targeted").optional(),
		host: z.string(),
	}),
	z.object({
		mode: z.literal("targeted").optional(),
		hostname: z.string(),
	}),
]);

const TailConsumerSchema = z.object({
	workerName: z.string(),
	streaming: z.boolean().optional(),
});

const TriggerSchema = z.discriminatedUnion("type", [
	// TODO: email triggers not yet implemented
	// z.object({ type: z.literal("email") }),
	z.object({
		type: z.literal("fetch"),
		pattern: z.string(),
		zone: z.string().optional(),
	}),
	z.object({
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
	z.object({
		type: z.literal("scheduled"),
		schedules: z.array(z.string()),
	}),
]);

const UnsafeSchema = z.object({
	metadata: z.record(z.string(), z.unknown()).optional(),
	capnp: z
		.union([
			z.object({
				basePath: z.string(),
				sourceSchemas: z.array(z.string()),
				compiledSchema: z.never().optional(),
			}),
			z.object({
				basePath: z.never().optional(),
				sourceSchemas: z.never().optional(),
				compiledSchema: z.string(),
			}),
		])
		.optional(),
});

export const ConfigSchema = z.object({
	name: z.string().optional(),
	accountId: z.string().optional(),
	compatibilityDate: z.string().optional(),
	compatibilityFlags: z.array(z.string()).optional(),
	entrypoint: z
		.union([z.string(), z.object({ default: z.string() })])
		.transform((value) => (typeof value === "string" ? value : value.default))
		.optional(),
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
	// previews: TODO
	env: EnvSchema,
	exports: z.record(z.string(), ExportSchema).optional(),
});

/**
 * Parsed (post-validation) config returned by `ConfigSchema.parse(...)`.
 */
export type ParsedConfig = z.output<typeof ConfigSchema>;

/**
 * Bidirectional drift check between {@link ConfigSchema} and the public
 * {@link UserConfig} interface. Excludes `entrypoint` and `env`, which
 * deliberately differ:
 *
 * - `entrypoint`: the public type accepts a `WorkerModule` namespace
 *   (produced by `import ... with { type: "cf-worker" }`), but the schema
 *   only accepts the post-`load.ts` shape (`string` or `{ default: string }`).
 *
 * - `env`: binding return types (e.g. `AiBinding`) carry phantom
 *   `__typeParams` / `__config` fields for type inference that the schema
 *   does not (and cannot) validate at runtime. Drift on `env` shape is
 *   guarded by the schema-level binding union and the `createBindings`
 *   factory return types, which must be kept in sync manually.
 */
type _ComparableInput = Omit<
	z.input<typeof ConfigSchema>,
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
