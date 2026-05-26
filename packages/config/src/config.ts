// oxlint-disable typescript/no-explicit-any -- needed in type utilities

import type { Json } from "./utils";
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
// BINDING OPTIONS
// Input types for each binding's configuration options. JSDoc is derived from
// `packages/workers-utils/src/config/environment.ts` — keep both in sync.
// ═══════════════════════════════════════════════════════════════════════════

interface AiBindingOptions {
	/** Whether the AI binding should be remote or not in local development. */
	remote?: boolean;
}

interface AiSearchBindingOptions {
	/** The user-chosen instance name. Must exist in Cloudflare at deploy time. */
	name: string;
	/** Whether the AI Search instance binding should be remote in local development. */
	remote?: boolean;
}

interface AiSearchNamespaceBindingOptions {
	/** The user-chosen namespace name. Must exist in Cloudflare at deploy time. */
	namespace: string;
	/** Whether the AI Search namespace binding should be remote in local development. */
	remote?: boolean;
}

interface AnalyticsEngineDatasetBindingOptions {
	/** The name of this dataset to write to. */
	name?: string;
}

interface ArtifactsBindingOptions {
	/** The namespace to use. */
	namespace: string;
	/** Whether to use the remote Artifacts service in local dev. */
	remote?: boolean;
}

interface BrowserBindingOptions {
	/** Whether the Browser binding should be remote or not in local development. */
	remote?: boolean;
}

interface D1BindingOptions {
	/** The UUID of this D1 database (not required). */
	id?: string;
	/** The name of this D1 database. */
	name?: string;
	/** Whether the D1 database should be remote or not in local development. */
	remote?: boolean;
}

interface DispatchNamespaceBindingOptions {
	/** The namespace to bind to. */
	namespace: string;
	/** Details about the outbound Worker which will handle outbound requests from your namespace. */
	outbound?: {
		/** Name of the Worker handling the outbound requests. */
		workerName: string;
		/** (Optional) List of parameter names, for sending context from your dispatch Worker to the outbound handler. */
		parameters?: string[];
	};
	/** Whether the Dispatch Namespace should be remote or not in local development. */
	remote?: boolean;
}

interface FlagshipBindingOptions {
	/** The Flagship app ID to bind to. */
	id: string;
	/** Set to `true` to suppress the remote binding warning in local dev. Flagship bindings are always remote. */
	remote?: boolean;
}

interface HyperdriveBindingOptions {
	/** The ID of the Hyperdrive configuration. */
	id: string;
	/** The local database connection string used during local development. */
	localConnectionString?: string;
}

interface ImagesBindingOptions {
	/** Whether the Images binding should be remote or not in local development. */
	remote?: boolean;
}

interface KvBindingOptions {
	/** The ID of the KV namespace. */
	id?: string;
	// TODO: name support not yet implemented
	// name?: string;
	/** Whether the KV namespace should be remote or not in local development. */
	remote?: boolean;
}

interface LogfwdrBindingOptions {
	/** The destination for this logged message. */
	destination: string;
}

interface MediaBindingOptions {
	/** Whether the Media binding should be remote or not. */
	remote?: boolean;
}

interface MtlsCertificateBindingOptions {
	/** The UUID of the uploaded mTLS certificate. */
	id: string;
	/** Whether the mTLS fetcher should be remote or not in local development. */
	remote?: boolean;
}

interface PipelineBindingOptions {
	/** Name of the Pipeline to bind. */
	name: string;
	/** Whether the pipeline should be remote or not in local development. */
	remote?: boolean;
}

interface QueueBindingOptions {
	/** The name of this Queue. */
	name: string;
	/** The number of seconds to wait before delivering a message. */
	deliveryDelay?: number;
	/** Whether the Queue producer should be remote or not in local development. */
	remote?: boolean;
}

interface RateLimitBindingOptions {
	/** The namespace ID for this rate limiter. */
	namespace: string;
	/** Simple rate limiting configuration. */
	simple: {
		/** The maximum number of requests allowed in the time period. */
		limit: number;
		/** The time period in seconds (10 for ten seconds, 60 for one minute). */
		period: 10 | 60;
	};
}

interface R2BindingOptions {
	/** The name of this R2 bucket at the edge. */
	name?: string;
	/** The jurisdiction that the bucket exists in. Default if not present. */
	jurisdiction?: string;
	/** Whether the R2 bucket should be remote or not in local development. */
	remote?: boolean;
}

interface SecretsStoreSecretBindingOptions {
	/** ID of the secret store. */
	storeId: string;
	/** Name of the secret. */
	secretName: string;
}

interface SendEmailBindingOptions {
	/** If this binding should be restricted to a specific verified address. */
	destinationAddress?: string;
	/** If this binding should be restricted to a set of verified addresses. */
	allowedDestinationAddresses?: string[];
	/** If this binding should be restricted to a set of sender addresses. */
	allowedSenderAddresses?: string[];
	/** Whether the binding should be remote or not in local development. */
	remote?: boolean;
}

interface StreamBindingOptions {
	/** Whether the Stream binding should be remote or not in local development. */
	remote?: boolean;
}

interface UnsafeBindingOptions {
	/** The binding type identifier as recognised by the Workers runtime. */
	type: string;
	/** Local-dev plugin configuration for this unsafe binding. */
	dev?: {
		/** The plugin package that provides the binding's local-dev implementation. */
		plugin: {
			package: string;
			name: string;
		};
		/** Plugin-specific options. */
		options?: Record<string, unknown>;
	};
	[key: string]: unknown;
}

interface VectorizeBindingOptions {
	/** The name of the Vectorize index. */
	name: string;
	/** Whether the Vectorize index should be remote or not in local development. */
	remote?: boolean;
}

interface VpcServiceBindingOptions {
	/** The service ID of the VPC connectivity service. */
	id: string;
	/** Whether the VPC service is remote or not. */
	remote?: boolean;
}

type VpcNetworkBindingOptions =
	| {
			/** The tunnel ID of the Cloudflare Tunnel to route traffic through. Mutually exclusive with `networkId`. */
			tunnelId: string;
			/** Whether the VPC network is remote or not. */
			remote?: boolean;
	  }
	| {
			/** The network ID to route traffic through. Mutually exclusive with `tunnelId`. */
			networkId: string;
			/** Whether the VPC network is remote or not. */
			remote?: boolean;
	  };

// ═══════════════════════════════════════════════════════════════════════════
// BINDING RETURN TYPES
// The type returned by each binding method (includes the type discriminator).
// JSDoc on container interfaces is derived from
// `packages/workers-utils/src/config/environment.ts` — keep both in sync.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Binding to the Workers AI project.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workers-ai
 */
export interface AiBinding<
	TAiModelList extends AiModelListType = AiModels,
> extends AiBindingOptions {
	type: "ai";
	/** @internal Carries type parameters for inference */
	__typeParams: [TAiModelList];
}

/**
 * AI Search instance binding. Each binding is bound directly to a single
 * pre-existing instance within the "default" namespace.
 */
export interface AiSearchBinding extends AiSearchBindingOptions {
	type: "ai-search";
}

/**
 * AI Search namespace binding. Each binding is scoped to a namespace and
 * allows dynamic instance CRUD within it.
 */
export interface AiSearchNamespaceBinding extends AiSearchNamespaceBindingOptions {
	type: "ai-search-namespace";
}

/**
 * Binding to an Analytics Engine dataset.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#analytics-engine-datasets
 */
export interface AnalyticsEngineDatasetBinding extends AnalyticsEngineDatasetBindingOptions {
	type: "analytics-engine-dataset";
}

/**
 * Binding to an Artifacts instance. Artifacts provides git-compatible file
 * storage on Cloudflare Workers.
 */
export interface ArtifactsBinding extends ArtifactsBindingOptions {
	type: "artifacts";
}

/**
 * Binding to the Worker's static assets.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#assets
 */
export interface AssetsBinding {
	type: "assets";
}

/**
 * Binding to a headless browser usable from the Worker.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#browser-rendering
 */
export interface BrowserBinding extends BrowserBindingOptions {
	type: "browser";
}

/**
 * Binding to a D1 database.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases
 */
export interface D1Binding extends D1BindingOptions {
	type: "d1";
}

/**
 * Binding to a Workers for Platforms dispatch namespace.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#dispatch-namespace-bindings-workers-for-platforms
 */
export interface DispatchNamespaceBinding extends DispatchNamespaceBindingOptions {
	type: "dispatch-namespace";
}

/** Binding to a Flagship feature-flag service. */
export interface FlagshipBinding extends FlagshipBindingOptions {
	type: "flagship";
}

/**
 * Binding to a Hyperdrive configuration.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#hyperdrive
 */
export interface HyperdriveBinding extends HyperdriveBindingOptions {
	type: "hyperdrive";
}

/**
 * Binding to Cloudflare Images.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#images
 */
export interface ImagesBinding extends ImagesBindingOptions {
	type: "images";
}

/**
 * Inline JSON value made available to the Worker on `env` under the
 * binding name.
 */
export interface JsonBinding<T extends Json> {
	type: "json";
	/** The JSON value made available to the Worker. */
	value: T;
}

/**
 * Binding to a Workers KV namespace.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#kv-namespaces
 */
export interface KvBinding<
	TKey extends string = string,
> extends KvBindingOptions {
	type: "kv";
	/** @internal Carries type parameters for inference */
	__typeParams: [TKey];
}

/** Binding for forwarding logs to logfwdr. */
export interface LogfwdrBinding extends LogfwdrBindingOptions {
	type: "logfwdr";
}

/** Binding to Cloudflare Media Transformations. */
export interface MediaBinding extends MediaBindingOptions {
	type: "media";
}

/**
 * Binding to an uploaded mTLS certificate.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#mtls-certificates
 */
export interface MtlsCertificateBinding extends MtlsCertificateBindingOptions {
	type: "mtls-certificate";
}

/** Binding to a Cloudflare Pipeline. */
export interface PipelineBinding<
	TRecord extends PipelineRecord = PipelineRecord,
> extends PipelineBindingOptions {
	type: "pipeline";
	/** @internal Carries type parameters for inference */
	__typeParams: [TRecord];
}

/**
 * Producer binding to a Cloudflare Queue.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
 */
export interface QueueBinding<TBody = unknown> extends QueueBindingOptions {
	type: "queue";
	/** @internal Carries type parameters for inference */
	__typeParams: [TBody];
}

/** Binding to a rate limiter. */
export interface RateLimitBinding extends RateLimitBindingOptions {
	type: "rate-limit";
}

/**
 * Binding to an R2 bucket.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#r2-buckets
 */
export interface R2Binding extends R2BindingOptions {
	type: "r2";
}

/**
 * Declares a secret that is required by your Worker, exposed on `env` under
 * the binding name.
 *
 * When defined, this binding:
 * - Replaces .dev.vars/.env/process.env inference for type generation
 * - Enables local dev validation with warnings for missing secrets
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property
 */
export interface SecretBinding {
	type: "secret";
}

/** Binding to a Secrets Store secret. */
export interface SecretsStoreSecretBinding extends SecretsStoreSecretBindingOptions {
	type: "secrets-store-secret";
}

/**
 * Binding for sending email from inside the Worker.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#email-bindings
 */
export interface SendEmailBinding extends SendEmailBindingOptions {
	type: "send-email";
}

/** Binding to Cloudflare Stream. */
export interface StreamBinding extends StreamBindingOptions {
	type: "stream";
}

/**
 * Inline string value made available to the Worker on `env` under the
 * binding name.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
 */
export interface TextBinding<T extends string> {
	type: "text";
	/** The string value made available to the Worker. */
	value: T;
}

/**
 * Escape-hatch binding for runtime features that aren't directly supported
 * by this configuration. Included in the Worker's upload metadata without
 * changes.
 */
export interface UnsafeBinding {
	type: "unsafe";
	/** The raw binding shape passed to the Workers runtime. */
	value: UnsafeBindingOptions;
}

/**
 * Binding to a Vectorize index.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#vectorize-indexes
 */
export interface VectorizeBinding extends VectorizeBindingOptions {
	type: "vectorize";
}

/** Binding to the Worker version's metadata. */
export interface VersionMetadataBinding {
	type: "version-metadata";
}

/** Binding to a VPC service. */
export interface VpcServiceBinding extends VpcServiceBindingOptions {
	type: "vpc-service";
}

/** Binding to a VPC network. */
export type VpcNetworkBinding = VpcNetworkBindingOptions & {
	type: "vpc-network";
};

/** Binding to a Worker Loader. */
export interface WorkerLoaderBinding {
	type: "worker-loader";
}

// Cross-worker binding types (generic, with `__config` type for inference)

/**
 * Binding to a Durable Object class. `workerName` is the name of the Worker
 * that defines the class; `exportName` is the exported class name.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
 */
export interface DurableObjectBinding<
	TConfig,
	TWorkerName extends string,
	TExportName extends string,
> {
	type: "durable-object";
	/** The name of the Worker that defines the Durable Object class. */
	workerName: TWorkerName;
	/** The exported class name of the Durable Object. */
	exportName: TExportName;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

/**
 * Service binding (Worker-to-Worker). `workerName` is the name of the bound
 * Worker; `exportName` selects a named `WorkerEntrypoint` export (defaults to
 * the default export).
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
 */
export interface WorkerBinding<
	TConfig,
	TWorkerName extends string,
	TExportName extends string,
> {
	type: "worker";
	/** The name of the bound Worker. */
	workerName: TWorkerName;
	/** The named export to bind to (defaults to the default export). */
	exportName: TExportName;
	/** Optional properties that will be made available to the service via `ctx.props`. */
	props?: Record<string, unknown>;
	/** Whether the service binding should be remote or not in local development. */
	remote?: boolean;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

/**
 * Binding to a Workflow. `workerName` is the name of the Worker that defines
 * the Workflow; `exportName` is the exported `WorkflowEntrypoint` class name.
 */
export interface WorkflowBinding<
	TConfig,
	TWorkerName extends string,
	TExportName extends string,
> {
	type: "workflow";
	/** The name of the Worker that defines the Workflow. */
	workerName: TWorkerName;
	/** The exported class name of the Workflow. */
	exportName: TExportName;
	/** Whether the Workflow binding should be remote or not in local development. */
	remote?: boolean;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// BINDING TYPE INFERENCE
// Maps binding definitions to their corresponding Cloudflare runtime types.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapping from binding type literals to Cloudflare runtime types.
 *
 * For parameterized bindings (ai, kv, queue etc.), the type parameter is extracted
 * from the binding's `__typeParams` property.
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
	"worker-loader": WorkerLoader;
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
 * import { defineConfig } from "@cloudflare/config";
 * import type { InferDurableNamespaces, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineConfig({ name: "my-worker", ... });
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
type ConfigOrUndefined<TUnwrappedConfig, TName extends string> =
	TName extends InferWorkerName<TUnwrappedConfig>
		? ExtractConfigByName<TUnwrappedConfig, TName>
		: undefined;

/**
 * Returns valid Worker names.
 * For typed configs, returns the constrained union of known Worker names.
 * Otherwise, returns `string` to allow any `Worker` name.
 */
type WorkerName<TUnwrappedConfig> = TUnwrappedConfig extends { name: string }
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
type WorkerExportName<
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
type DurableObjectExportName<
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
export type UnwrapConfig<TConfig> = TConfig extends (
	...args: any[]
) => infer TReturn
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
 * import { defineConfig, bindings } from "@cloudflare/config";
 * import type { InferEnv, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineConfig({
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
 * import { defineConfig } from "@cloudflare/config";
 * import type { InferDurableNamespaces, UnwrapConfig } from "@cloudflare/config";
 *
 * const config = defineConfig({
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

// ═══════════════════════════════════════════════════════════════════════════
// BINDINGS API
// The public interface and factory for creating binding definitions.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base bindings interface - provides typed builder methods for non-cross-worker binding types.
 * This is used internally and extended by Bindings<TConfigs>.
 */
interface BaseBindings {
	// Value-first bindings
	/**
	 * Inline JSON value made available to the Worker on `env` under the
	 * binding name.
	 */
	json<T extends Json>(value: T): JsonBinding<T>;
	/**
	 * Inline string value made available to the Worker on `env` under the
	 * binding name.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
	 */
	text<T extends string>(value: T): TextBinding<T>;

	// Other bindings
	/**
	 * Binding to the Workers AI project.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workers-ai
	 */
	ai<TAiModelList extends AiModelListType = AiModels>(
		options?: AiBindingOptions
	): AiBinding<TAiModelList>;
	/**
	 * AI Search instance binding. Each binding is bound directly to a single
	 * pre-existing instance within the "default" namespace.
	 */
	aiSearch(options: AiSearchBindingOptions): AiSearchBinding;
	/**
	 * AI Search namespace binding. Each binding is scoped to a namespace and
	 * allows dynamic instance CRUD within it.
	 */
	aiSearchNamespace(
		options: AiSearchNamespaceBindingOptions
	): AiSearchNamespaceBinding;
	/**
	 * Binding to an Analytics Engine dataset.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#analytics-engine-datasets
	 */
	analyticsEngineDataset(
		options?: AnalyticsEngineDatasetBindingOptions
	): AnalyticsEngineDatasetBinding;
	/**
	 * Binding to an Artifacts instance. Artifacts provides git-compatible file
	 * storage on Cloudflare Workers.
	 */
	artifacts(options: ArtifactsBindingOptions): ArtifactsBinding;
	/**
	 * Binding to the Worker's static assets.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#assets
	 */
	assets(): AssetsBinding;
	/**
	 * Binding to a headless browser usable from the Worker.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#browser-rendering
	 */
	browser(options?: BrowserBindingOptions): BrowserBinding;
	/**
	 * Binding to a D1 database.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases
	 */
	d1(options?: D1BindingOptions): D1Binding;
	/**
	 * Binding to a Workers for Platforms dispatch namespace.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#dispatch-namespace-bindings-workers-for-platforms
	 */
	dispatchNamespace(
		options: DispatchNamespaceBindingOptions
	): DispatchNamespaceBinding;
	/** Binding to a Flagship feature-flag service. */
	flagship(options: FlagshipBindingOptions): FlagshipBinding;
	/**
	 * Binding to a Hyperdrive configuration.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#hyperdrive
	 */
	hyperdrive(options: HyperdriveBindingOptions): HyperdriveBinding;
	/**
	 * Binding to Cloudflare Images.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#images
	 */
	images(options?: ImagesBindingOptions): ImagesBinding;
	/**
	 * Binding to a Workers KV namespace.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#kv-namespaces
	 */
	kv<TKey extends string = string>(options?: KvBindingOptions): KvBinding<TKey>;
	/** Binding for forwarding logs to logfwdr. */
	logfwdr(options: LogfwdrBindingOptions): LogfwdrBinding;
	/** Binding to Cloudflare Media Transformations. */
	media(options?: MediaBindingOptions): MediaBinding;
	/**
	 * Binding to an uploaded mTLS certificate.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#mtls-certificates
	 */
	mtlsCertificate(
		options: MtlsCertificateBindingOptions
	): MtlsCertificateBinding;
	/** Binding to a Cloudflare Pipeline. */
	pipeline<TRecord extends PipelineRecord = PipelineRecord>(
		options: PipelineBindingOptions
	): PipelineBinding<TRecord>;
	/**
	 * Producer binding to a Cloudflare Queue.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
	 */
	queue<TBody = unknown>(options: QueueBindingOptions): QueueBinding<TBody>;
	/** Binding to a rate limiter. */
	rateLimit(options: RateLimitBindingOptions): RateLimitBinding;
	/**
	 * Binding to an R2 bucket.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#r2-buckets
	 */
	r2(options?: R2BindingOptions): R2Binding;
	/**
	 * Declares a secret that is required by your Worker, exposed on `env` under
	 * the binding name.
	 *
	 * When defined, this binding:
	 * - Replaces .dev.vars/.env/process.env inference for type generation
	 * - Enables local dev validation with warnings for missing secrets
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property
	 */
	secret(): SecretBinding;
	/** Binding to a Secrets Store secret. */
	secretsStoreSecret(
		options: SecretsStoreSecretBindingOptions
	): SecretsStoreSecretBinding;
	/**
	 * Binding for sending email from inside the Worker.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#email-bindings
	 */
	sendEmail(options?: SendEmailBindingOptions): SendEmailBinding;
	/** Binding to Cloudflare Stream. */
	stream(options?: StreamBindingOptions): StreamBinding;
	/**
	 * Escape-hatch binding for runtime features that aren't directly supported
	 * by this configuration. Included in the Worker's upload metadata without
	 * changes.
	 */
	unsafe(options: UnsafeBindingOptions): UnsafeBinding;
	/**
	 * Binding to a Vectorize index.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#vectorize-indexes
	 */
	vectorize(options: VectorizeBindingOptions): VectorizeBinding;
	/** Binding to the Worker version's metadata. */
	versionMetadata(): VersionMetadataBinding;
	/** Binding to a VPC service. */
	vpcService(options: VpcServiceBindingOptions): VpcServiceBinding;
	/** Binding to a VPC network. */
	vpcNetwork(options: VpcNetworkBindingOptions): VpcNetworkBinding;
	/** Binding to a Worker Loader. */
	workerLoader(): WorkerLoaderBinding;
}

/**
 * Bindings interface for defining Worker bindings in config.
 *
 * When used without a type parameter, all cross-worker bindings (`worker`,
 * `durableObject`, `workflow`) allow any `workerName` and `exportName`.
 *
 * When parameterized with specific config types, cross-worker bindings become type-safe:
 * - `workerName` is constrained to the `name` from the config(s)
 * - `exportName` is constrained to valid exports for that worker
 * - The resulting binding types are fully parameterized
 *
 * @example
 * ```typescript
 * // Untyped usage with the bindings singleton
 * import { defineConfig, bindings } from "@cloudflare/config";
 *
 * export default defineConfig({
 *   env: {
 *     MY_KV: bindings.kv(),
 *     MY_DO: bindings.durableObject({ workerName: "any-worker", exportName: "AnyExport" }),
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Typed usage with createBindings
 * import { defineConfig, createBindings } from "@cloudflare/config";
 * import type WorkerAConfig from "@worker-a-package/config";
 *
 * const b = createBindings<typeof WorkerAConfig>();
 *
 * export default defineConfig({
 *   env: {
 *     // Type-safe: workerName must be "worker-a"
 *     WORKER_A: b.worker({ workerName: "worker-a" }),
 *     // Type-safe: exportName must be a valid durable object export
 *     MY_DO: b.durableObject({ workerName: "worker-a", exportName: "MyDurableObject" }),
 *   },
 * });
 * ```
 */
export interface Bindings<
	TConfig,
	TUnwrappedConfig = UnwrapConfig<TConfig>,
> extends BaseBindings {
	/**
	 * Service binding (Worker-to-Worker). `workerName` is the name of the bound
	 * Worker; `exportName` selects a named `WorkerEntrypoint` export (defaults to
	 * the default export).
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
	 */
	worker<
		TWorkerName extends WorkerName<TUnwrappedConfig>,
		TExportName extends
			| WorkerExportName<TUnwrappedConfig, TWorkerName>
			| undefined = undefined,
	>(options: {
		workerName: TWorkerName;
		exportName?: TExportName;
		props?: Record<string, unknown>;
		remote?: boolean;
	}): WorkerBinding<
		ConfigOrUndefined<TUnwrappedConfig, TWorkerName>,
		TWorkerName,
		TExportName extends string ? TExportName : "default"
	>;

	/**
	 * Binding to a Durable Object class. `workerName` is the name of the Worker
	 * that defines the class; `exportName` is the exported class name.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
	 */
	durableObject<
		TWorkerName extends WorkerName<TUnwrappedConfig>,
		TExportName extends DurableObjectExportName<TUnwrappedConfig, TWorkerName>,
	>(options: {
		workerName: TWorkerName;
		exportName: TExportName;
	}): DurableObjectBinding<
		ConfigOrUndefined<TUnwrappedConfig, TWorkerName>,
		TWorkerName,
		TExportName
	>;

	// TODO: re-enable when workflow bindings return.
	// /**
	//  * Create a Workflow binding.
	//  * `workerName` must match a known config's name (or any `string` for untyped bindings).
	//  * `exportName` must be a valid `WorkflowEntrypoint` export for the given Worker.
	//  */
	// workflow<
	// 	TWorkerName extends WorkerName<TUnwrappedConfig>,
	// 	TExportName extends WorkflowExportName<TUnwrappedConfig, TWorkerName>,
	// >(options: {
	// 	workerName: TWorkerName;
	// 	exportName: TExportName;
	// 	remote?: boolean;
	// }): WorkflowBinding<
	// 	ConfigOrUndefined<TUnwrappedConfig, TWorkerName>,
	// 	TWorkerName,
	// 	TExportName
	// >;
}

/**
 * Create a bindings builder for defining Worker bindings.
 *
 * Without a type parameter, creates untyped bindings where cross-worker
 * bindings (`worker`, `durableObject`, `workflow`) accept any `workerName`/`exportName`.
 *
 * With a type parameter, creates typed bindings with autocomplete and
 * type checking for known Worker configs.
 *
 * @example
 * ```typescript
 * import type WorkerAConfig from "@worker-a-package/config";
 * const b = createBindings<typeof WorkerAConfig>();
 * ```
 */
export function createBindings<TConfig>(): Bindings<TConfig> {
	return {
		ai: (options) => ({ type: "ai", ...options }),
		aiSearch: (options) => ({ type: "ai-search", ...options }),
		aiSearchNamespace: (options) => ({
			type: "ai-search-namespace",
			...options,
		}),
		analyticsEngineDataset: (options) => ({
			type: "analytics-engine-dataset",
			...options,
		}),
		artifacts: (options) => ({ type: "artifacts", ...options }),
		assets: () => ({ type: "assets" }),
		browser: (options) => ({ type: "browser", ...options }),
		d1: (options) => ({ type: "d1", ...options }),
		dispatchNamespace: (options) => ({
			type: "dispatch-namespace",
			...options,
		}),
		durableObject: (options) => ({ type: "durable-object", ...options }),
		flagship: (options) => ({ type: "flagship", ...options }),
		hyperdrive: (options) => ({ type: "hyperdrive", ...options }),
		images: (options) => ({ type: "images", ...options }),
		json: (value) => ({ type: "json", value }),
		kv: (options) => ({ type: "kv", ...options }),
		logfwdr: (options) => ({ type: "logfwdr", ...options }),
		media: (options) => ({ type: "media", ...options }),
		mtlsCertificate: (options) => ({ type: "mtls-certificate", ...options }),
		pipeline: (options) => ({ type: "pipeline", ...options }),
		queue: (options) => ({ type: "queue", ...options }),
		rateLimit: (options) => ({ type: "rate-limit", ...options }),
		r2: (options) => ({ type: "r2", ...options }),
		secret: () => ({ type: "secret" }),
		secretsStoreSecret: (options) => ({
			type: "secrets-store-secret",
			...options,
		}),
		sendEmail: (options) => ({ type: "send-email", ...options }),
		stream: (options) => ({ type: "stream", ...options }),
		text: (value) => ({ type: "text", value }),
		unsafe: (options) => ({ type: "unsafe", value: options }),
		vectorize: (options) => ({ type: "vectorize", ...options }),
		versionMetadata: () => ({ type: "version-metadata" }),
		vpcService: (options) => ({ type: "vpc-service", ...options }),
		vpcNetwork: (options) => ({ type: "vpc-network", ...options }),
		worker: (options) => ({ type: "worker", ...options }),
		workerLoader: () => ({ type: "worker-loader" }),
		// TODO: re-enable when workflow bindings return.
		// workflow: (options) => ({ type: "workflow", ...options }),
	} as Bindings<TConfig>;
}

/**
 * Pre-created untyped bindings for convenience.
 * Use this when you don't need typed cross-worker bindings.
 *
 * @example
 * ```typescript
 * import { defineConfig, bindings } from "@cloudflare/config";
 *
 * export default defineConfig({
 *   env: {
 *     MY_KV: bindings.kv(),
 *     MY_DB: bindings.d1(),
 *   },
 * });
 * ```
 */
export const bindings = createBindings();
