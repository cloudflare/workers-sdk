// oxlint-disable typescript/no-explicit-any -- needed in type utilities

import type {
	JsonBinding,
	TextBinding,
	TypedAiBinding,
	TypedDurableObjectBinding,
	TypedKvBinding,
	TypedPipelineBinding,
	TypedQueueBinding,
	TypedWorkerBinding,
	TypedWorkflowBinding,
} from "./bindings";
import type { UserConfigExport, WorkerDefinition } from "./worker-definition";
import type { Pipeline } from "cloudflare:pipelines";

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Worker's entry module, imported with the `{ type: "cf-worker" }` import attribute
 * @example
 * ```ts
 * import * as entrypoint from "./src" with { type: "cf-worker" };
 * ```
 */
export type WorkerModule = Record<string, any>;

/**
 * Default module type representing an unknown Worker's exports.
 * - default export can be `ExportedHandler` or a `WorkerEntrypoint` class constructor
 * - named exports can be `WorkerEntrypoint`, `DurableObject`, or `WorkflowEntrypoint` class constructors
 */
interface DefaultModule {
	default?: ExportedHandler | Constructor<Rpc.WorkerEntrypointBranded>;
	[key: string]:
		| ExportedHandler
		| Constructor<Rpc.WorkerEntrypointBranded>
		| Constructor<Rpc.DurableObjectBranded>
		| Constructor<Rpc.WorkflowEntrypointBranded>
		| undefined;
}

/**
 * Represents a class constructor that creates instances of TInstance.
 */
type Constructor<TInstance> = new (...args: any[]) => TInstance;

/**
 * Extracts the instance type from a class constructor if it extends `TInstance`.
 */
type ExtractInstance<T, TInstance> =
	T extends Constructor<TInstance> ? InstanceType<T> : never;

// ═══════════════════════════════════════════════════════════════════════════
// BINDING TYPE INFERENCE
// Maps binding definitions to their corresponding Cloudflare runtime types.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapping from binding type literals to Cloudflare runtime types.
 *
 * Entries fall into two groups:
 * - Parameterized bindings (ai, json, kv, pipeline, queue, text) refine their
 *   runtime type from the binding instance via nominal matches against the
 *   `Typed*Binding` / `JsonBinding` / `TextBinding` interfaces from
 *   `./bindings`. When `TBinding` does not match, the entry falls back to the
 *   unparameterized runtime type.
 * - Non-parameterized bindings map their type literal directly to a runtime
 *   type and ignore `TBinding`.
 *
 * IMPORTANT: The right-hand-side identifiers in this map (e.g. `KVNamespace`,
 * `ImagesBinding`, `Fetcher`) must resolve to the ambient runtime types from
 * `@cloudflare/workers-types`, not to local config interfaces. Several local
 * binding interfaces in `./bindings.ts` (`ImagesBinding`, `MediaBinding`,
 * `StreamBinding`) share names with ambient globals — importing those local
 * types into this file silently shadows the globals and breaks `InferEnv`.
 * Only import the `Typed*Binding`, `JsonBinding`, and `TextBinding` interfaces
 * from `./bindings` (their names do not collide with ambient globals); never
 * widen the import to a wildcard or to the plain `*Binding` interfaces.
 */
interface BindingTypeMap<TBinding> {
	// Parameterized bindings - refine via nominal match on the binding instance
	ai: TBinding extends TypedAiBinding<infer T> ? Ai<T> : Ai;
	json: TBinding extends JsonBinding<infer T> ? T : never;
	kv: TBinding extends TypedKvBinding<infer T> ? KVNamespace<T> : KVNamespace;
	pipeline: TBinding extends TypedPipelineBinding<infer T>
		? Pipeline<T>
		: Pipeline;
	queue: TBinding extends TypedQueueBinding<infer T> ? Queue<T> : Queue;
	text: TBinding extends TextBinding<infer T> ? T : never;

	// Non-parameterized bindings
	"agent-memory": AgentMemoryNamespace;
	"ai-search": AiSearchInstance;
	"ai-search-namespace": AiSearchNamespace;
	"analytics-engine-dataset": AnalyticsEngineDataset;
	artifacts: Artifacts;
	assets: Fetcher;
	browser: BrowserRun;
	d1: D1Database;
	"dispatch-namespace": DispatchNamespace;
	"durable-object": DurableObjectNamespace;
	flagship: Flagship;
	hyperdrive: Hyperdrive;
	images: ImagesBinding;
	logfwdr: any;
	media: MediaBinding;
	"mtls-certificate": Fetcher;
	"rate-limit": RateLimit;
	r2: R2Bucket;
	secret: string;
	"secrets-store-secret": SecretsStoreSecret;
	"send-email": SendEmail;
	stream: StreamBinding;
	vectorize: VectorizeIndex;
	"version-metadata": WorkerVersionMetadata;
	"vpc-service": Fetcher;
	"vpc-network": Fetcher;
	"web-search": WebSearch;
	worker: Fetcher;
	"worker-loader": WorkerLoader;
	workflow: Workflow;
}

type InferBindingType<TBinding> =
	// Worker binding
	TBinding extends TypedWorkerBinding<
		infer TConfig,
		infer TExportName extends string
	>
		? InferMainModule<TConfig> extends infer TModule extends WorkerModule
			? TExportName extends keyof TModule
				? TModule[TExportName] extends Constructor<any>
					? Fetcher<
							ExtractInstance<TModule[TExportName], Rpc.WorkerEntrypointBranded>
						>
					: Fetcher
				: never
			: never
		: // Durable Object binding
			TBinding extends TypedDurableObjectBinding<
					infer TConfig,
					infer TExportName extends string
			  >
			? InferMainModule<TConfig> extends infer TModule extends WorkerModule
				? TExportName extends keyof TModule
					? DurableObjectNamespace<
							ExtractInstance<TModule[TExportName], Rpc.DurableObjectBranded>
						>
					: never
				: never
			: // Workflow binding
				TBinding extends TypedWorkflowBinding<
						infer TConfig,
						infer TExportName extends string
				  >
				? InferMainModule<TConfig> extends infer TModule extends WorkerModule
					? TExportName extends keyof TModule
						? ExtractInstance<
								TModule[TExportName],
								Rpc.WorkflowEntrypointBranded
							> extends infer TWorkflow
							? TWorkflow extends {
									run(event: { payload: infer P }, step: any): any;
								}
								? Workflow<P>
								: Workflow
							: Workflow
						: never
					: never
				: // Unsafe bindings
					TBinding extends { type: `unsafe:${string}` }
					? any
					: // Other bindings
						TBinding extends {
								type: infer K extends keyof BindingTypeMap<TBinding>;
						  }
						? BindingTypeMap<TBinding>[K]
						: never;

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-WORKER BINDING HELPERS (INTERNAL)
// Types used by the Bindings interface for type-safe cross-worker bindings.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Infer the Worker name from a config.
 *
 * @example
 * ```typescript
 * import { defineWorker } from "@cloudflare/config";
 * import type { InferDurableNamespaces, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineWorker({ name: "my-worker", ... });
 *
 * type WorkerConfig = UnwrapConfig<typeof config>;
 * // Inferred as: "my-worker"
 * type Name = InferWorkerName<WorkerConfig>;
 * ```
 */
export type InferWorkerName<TUnwrappedConfig> = TUnwrappedConfig extends {
	name: infer TName extends string;
}
	? TName
	: never;

/**
 * Infer export names from a config's exports, optionally filtered by type.
 * When TExportType is `string` (default), returns all export names.
 * When TExportType is a specific literal like `"durable-object"` or `"workflow"`,
 * returns only exports of that type.
 */
export type InferExportsByType<
	TUnwrappedConfig,
	TExportType extends string = string,
> = TUnwrappedConfig extends {
	exports: infer TExports extends Record<string, { type: string }>;
}
	? {
			[K in keyof TExports]: TExports[K] extends { type: TExportType }
				? K & string
				: never;
		}[keyof TExports]
	: never;

/**
 * Infer `WorkerEntrypoint` export names from a config.
 * Returns named module exports that are not declared as type `"durable-object"` or `"workflow"` in `exports`.
 * Excludes `"default"` since `exportName` should only be provided for named exports.
 */
export type InferWorkerEntrypointExports<TUnwrappedConfig> = Exclude<
	keyof InferMainModule<TUnwrappedConfig> & string,
	| "default"
	| InferExportsByType<TUnwrappedConfig, "durable-object" | "workflow">
>;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG INFERENCE (PUBLIC)
// Exported types for inferring runtime types from config definitions.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unwrap function and promise types to get the underlying config.
 * Use this to normalize a config before passing it to other inference utilities.
 */
export type UnwrapConfig<TConfig> =
	TConfig extends WorkerDefinition<infer TUnwrappedConfig>
		? TUnwrappedConfig
		: TConfig extends UserConfigExport<infer TUnwrappedConfig>
			? TUnwrappedConfig
			: never;

/**
 * Infer the `Env` interface type from a Worker config.
 *
 * Transforms a config object's `env` bindings into their
 * corresponding Cloudflare runtime types.
 *
 * @example
 * ```typescript
 * import { defineWorker, bindings } from "@cloudflare/config";
 * import type { InferEnv, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineWorker({
 *   env: {
 *     MY_JSON: bindings.json({ id: string }),
 *     MY_KV: bindings.kv(),
 *   },
 * });
 *
 * type WorkerConfig = UnwrapConfig<typeof config>;
 * // Inferred as: { MY_JSON: { id: string }; MY_KV: KVNamespace }
 * export type Env = InferEnv<WorkerConfig>;
 * ```
 */
export type InferEnv<TUnwrappedConfig> = TUnwrappedConfig extends {
	env: infer TEnv extends Record<string, any>;
}
	? { [K in keyof TEnv]: InferBindingType<TEnv[K]> }
	: never;

/**
 * Infer the Durable Object namespace names from a Worker config's exports.
 * Returns a union of export names that declare a *live* Durable Object —
 * `type: "durable-object"` with `state` either omitted, `"created"`, or
 * `"expecting-transfer"`. Tombstone entries (`deleted`, `renamed`,
 * `transferred`) are excluded because they retire the namespace and a
 * binding to a tombstoned class would fail at deploy time.
 *
 * @example
 * ```typescript
 * import { defineWorker } from "@cloudflare/config";
 * import type { InferDurableNamespaces, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineWorker({
 *   exports: {
 *     MyDurableObject: { type: "durable-object", storage: "sqlite" },
 *     OldGone:         { type: "durable-object", state: "deleted" },
 *   },
 * });
 *
 * type WorkerConfig = UnwrapConfig<typeof config>;
 * // Inferred as: "MyDurableObject" (the deleted tombstone is excluded)
 * type DurableNamespaces = InferDurableNamespaces<WorkerConfig>;
 * ```
 */
export type InferDurableNamespaces<TUnwrappedConfig> =
	TUnwrappedConfig extends {
		exports: infer TExports extends Record<string, { type: string }>;
	}
		? {
				[K in keyof TExports]: TExports[K] extends {
					type: "durable-object";
				}
					? TExports[K] extends {
							state: "deleted" | "renamed" | "transferred";
						}
						? never
						: K & string
					: never;
			}[keyof TExports]
		: never;

/**
 * Infer the main module type from a Worker config's entrypoint.
 * If entrypoint is a module namespace object, returns that type.
 * If entrypoint is a `string` or not present, returns `DefaultModule` as a fallback.
 */
export type InferMainModule<TUnwrappedConfig> = TUnwrappedConfig extends {
	entrypoint: infer TModule extends WorkerModule;
}
	? TModule
	: DefaultModule;
