// oxlint-disable typescript/no-explicit-any -- needed in type utilities

import type { WorkerDefinition } from "./worker-definition";
import type { Pipeline, PipelineRecord } from "cloudflare:pipelines";

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
 * For parameterized bindings (ai, kv, queue etc.), the type parameter is extracted
 * from the binding's `__typeParams` property.
 *
 * IMPORTANT: The right-hand-side identifiers in this map (e.g. `KVNamespace`,
 * `ImagesBinding`, `Fetcher`) must resolve to the ambient runtime types from
 * `@cloudflare/workers-types`, not to local config interfaces. Several local
 * binding interfaces in `./bindings.ts` (`ImagesBinding`, `MediaBinding`,
 * `StreamBinding`) share names with ambient globals — importing those local
 * types into this file silently shadows the globals and breaks `InferEnv`.
 * Do not add `import type { ... } from "./bindings"` here.
 */
interface BindingTypeMap<TBinding> {
	// Parameterized bindings - extract `__typeParams` and apply to runtime types
	ai: TBinding extends { __typeParams: [infer T extends AiModelListType] }
		? Ai<T>
		: Ai;
	kv: TBinding extends { __typeParams: [infer T extends string] }
		? KVNamespace<T>
		: KVNamespace;
	pipeline: TBinding extends { __typeParams: [infer T extends PipelineRecord] }
		? Pipeline<T>
		: Pipeline;
	queue: TBinding extends { __typeParams: [infer T] } ? Queue<T> : Queue;

	// Non-parameterized bindings
	"ai-search": AiSearchInstance;
	"ai-search-namespace": AiSearchNamespace;
	"analytics-engine-dataset": AnalyticsEngineDataset;
	artifacts: Artifacts;
	assets: Fetcher;
	browser: Fetcher;
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
	unsafe: any;
	worker: Fetcher;
	"worker-loader": WorkerLoader;
	workflow: Workflow;
}

type InferBindingType<TBinding> =
	// Worker binding
	TBinding extends {
		type: "worker";
		exportName: infer TExportName extends string;
		__config: infer TUnwrappedConfig;
	}
		? InferMainModule<TUnwrappedConfig> extends infer TModule extends
				WorkerModule
			? TExportName extends keyof TModule
				? TModule[TExportName] extends Constructor<any>
					? Fetcher<
							ExtractInstance<TModule[TExportName], Rpc.WorkerEntrypointBranded>
						>
					: Fetcher
				: never
			: never
		: // Durable Object binding
			TBinding extends {
					type: "durable-object";
					exportName: infer TExportName extends string;
					__config: infer TUnwrappedConfig;
			  }
			? InferMainModule<TUnwrappedConfig> extends infer TModule extends
					WorkerModule
				? TExportName extends keyof TModule
					? DurableObjectNamespace<
							ExtractInstance<TModule[TExportName], Rpc.DurableObjectBranded>
						>
					: never
				: never
			: // Workflow binding
				TBinding extends {
						type: "workflow";
						exportName: infer TExportName extends string;
						__config: infer TUnwrappedConfig;
				  }
				? InferMainModule<TUnwrappedConfig> extends infer TModule extends
						WorkerModule
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
				: // JSON bindings
					TBinding extends { type: "json"; value: infer TValue }
					? TValue
					: // Text bindings
						TBinding extends { type: "text"; value: infer TValue }
						? TValue
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
type InferWorkerName<TUnwrappedConfig> = TUnwrappedConfig extends {
	name: infer TName extends string;
}
	? TName
	: never;

/**
 * Extract config(s) from `TUnwrappedConfig` where `TName` is assignable to the config's name.
 * Unlike Extract, this works when a config has a union name like `"worker-a"` | `"worker-b"`.
 */
type ExtractConfigByName<TUnwrappedConfig, TName extends string> =
	TName extends InferWorkerName<TUnwrappedConfig> ? TUnwrappedConfig : never;

/**
 * Resolves the config type for cross-worker bindings.
 * Returns the extracted config if `workerName` matches a known config.
 * Otherwise returns `undefined`.
 */
export type ConfigOrUndefined<TUnwrappedConfig, TName extends string> =
	TName extends InferWorkerName<TUnwrappedConfig>
		? ExtractConfigByName<TUnwrappedConfig, TName>
		: undefined;

/**
 * Returns valid Worker names.
 * For typed configs, returns the constrained union of known Worker names.
 * Otherwise, returns `string` to allow any `Worker` name.
 */
export type WorkerName<TUnwrappedConfig> = TUnwrappedConfig extends {
	name: string;
}
	? InferWorkerName<TUnwrappedConfig>
	: string;

/**
 * Infer export names from a config's exports, optionally filtered by type.
 * When TExportType is `string` (default), returns all export names.
 * When TExportType is a specific literal like `"durable-object"` or `"workflow"`,
 * returns only exports of that type.
 */
type InferExportsByType<
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
type InferEntrypointExports<TUnwrappedConfig> = Exclude<
	keyof InferMainModule<TUnwrappedConfig> & string,
	| "default"
	| InferExportsByType<TUnwrappedConfig, "durable-object" | "workflow">
>;

/**
 * Returns valid exports for a Worker binding.
 * For known Workers, returns the constrained union of entrypoint exports.
 * For unknown Workers in typed configs, returns `never`.
 * For untyped configs, returns `string` to allow any export name.
 */
export type WorkerExportName<
	TUnwrappedConfig,
	TName extends string,
> = TUnwrappedConfig extends { name: string }
	? TName extends InferWorkerName<TUnwrappedConfig>
		? InferEntrypointExports<ExtractConfigByName<TUnwrappedConfig, TName>>
		: never
	: string;

/**
 * Returns valid exports for a Durable Object binding.
 * For known Workers, returns the constrained union of Durable Object exports.
 * For unknown Workers in typed configs, returns `never`.
 * For untyped configs, returns `string` to allow any export name.
 */
export type DurableObjectExportName<
	TUnwrappedConfig,
	TName extends string,
> = TUnwrappedConfig extends { name: string }
	? TName extends InferWorkerName<TUnwrappedConfig>
		? InferExportsByType<
				ExtractConfigByName<TUnwrappedConfig, TName>,
				"durable-object"
			>
		: never
	: string;

// TODO: re-enable when workflow bindings return.
// /**
//  * Returns valid exports for a Workflow binding.
//  * For known Workers, returns the constrained union of Workflow exports.
//  * For unknown workers in typed configs, returns `never`.
//  * For untyped configs, returns `string` to allow any export name.
//  */
// type WorkflowExportName<
// 	TUnwrappedConfig,
// 	TName extends string,
// > = TUnwrappedConfig extends { name: string }
// 	? TName extends InferWorkerName<TUnwrappedConfig>
// 		? InferExportsByType<
// 				ExtractConfigByName<TUnwrappedConfig, TName>,
// 				"workflow"
// 			>
// 		: never
// 	: string;

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG INFERENCE (PUBLIC)
// Exported types for inferring runtime types from config definitions.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unwrap function and promise types to get the underlying config.
 * Use this to normalize a config before passing it to other inference utilities.
 */
export type UnwrapConfig<TConfig> =
	TConfig extends WorkerDefinition<infer T>
		? T
		: TConfig extends (...args: any[]) => infer TReturn
			? UnwrapConfig<TReturn>
			: TConfig extends Promise<infer TCompletion>
				? TCompletion
				: TConfig;

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
 * Returns a union of export names that have `type: "durable-object"`.
 *
 * @example
 * ```typescript
 * import { defineWorker } from "@cloudflare/config";
 * import type { InferDurableNamespaces, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineWorker({
 *   exports: {
 *     MyDurableObject: { type: "durable-object", storage: "sqlite" },
 *     MyWorkflow: { type: "workflow", name: "my-workflow" },
 *   },
 * });
 *
 * type WorkerConfig = UnwrapConfig<typeof config>;
 * // Inferred as: "MyDurableObject"
 * type DurableNamespaces = InferDurableNamespaces<WorkerConfig>;
 * ```
 */
export type InferDurableNamespaces<TUnwrappedConfig> = InferExportsByType<
	TUnwrappedConfig,
	"durable-object"
>;

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
