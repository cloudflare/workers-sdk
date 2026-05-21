// oxlint-disable typescript/no-explicit-any -- needed in type utilities

import type { Pipeline, PipelineRecord } from "cloudflare:pipelines";

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Represents any valid JSON value.
 */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

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
// Input types for each binding's configuration options.
// ═══════════════════════════════════════════════════════════════════════════

interface AiBindingOptions {
	remote?: boolean;
}

interface AiSearchBindingOptions {
	name: string;
	remote?: boolean;
}

interface AiSearchNamespaceBindingOptions {
	namespace: string;
	remote?: boolean;
}

interface AnalyticsEngineDatasetBindingOptions {
	name?: string;
}

interface ArtifactsBindingOptions {
	namespace: string;
	remote?: boolean;
}

interface BrowserBindingOptions {
	remote?: boolean;
}

interface D1BindingOptions {
	id?: string;
	name?: string;
	remote?: boolean;
}

interface DispatchNamespaceBindingOptions {
	namespace: string;
	outbound?: {
		workerName: string;
		parameters?: string[];
	};
	remote?: boolean;
}

interface FlagshipBindingOptions {
	id: string;
	remote?: boolean;
}

interface HyperdriveBindingOptions {
	id: string;
	localConnectionString?: string;
}

interface ImagesBindingOptions {
	remote?: boolean;
}

interface KvBindingOptions {
	id?: string;
	// TODO: name support not yet implemented
	// name?: string;
	remote?: boolean;
}

interface LogfwdrBindingOptions {
	destination: string;
}

interface MediaBindingOptions {
	remote?: boolean;
}

interface MtlsCertificateBindingOptions {
	id: string;
	remote?: boolean;
}

interface PipelineBindingOptions {
	name: string;
	remote?: boolean;
}

interface QueueBindingOptions {
	name: string;
	deliveryDelay?: number;
	remote?: boolean;
}

interface RateLimitBindingOptions {
	namespace: string;
	simple: {
		limit: number;
		period: 10 | 60;
	};
}

interface R2BindingOptions {
	name?: string;
	jurisdiction?: string;
	remote?: boolean;
}

interface SecretsStoreSecretBindingOptions {
	storeId: string;
	name: string;
}

interface SendEmailBindingOptions {
	destinationAddress?: string;
	allowedDestinationAddresses?: string[];
	allowedSenderAddresses?: string[];
	remote?: boolean;
}

interface StreamBindingOptions {
	remote?: boolean;
}

interface UnsafeBindingOptions {
	type: string;
	dev?: {
		plugin: {
			package: string;
			name: string;
		};
		options?: Record<string, unknown>;
	};
	[key: string]: unknown;
}

interface VectorizeBindingOptions {
	name: string;
	remote?: boolean;
}

interface VpcServiceBindingOptions {
	id: string;
	remote?: boolean;
}

type VpcNetworkBindingOptions =
	| { tunnelId: string; remote?: boolean }
	| { networkId: string; remote?: boolean };

// ═══════════════════════════════════════════════════════════════════════════
// BINDING RETURN TYPES
// The type returned by each binding method (includes the type discriminator).
// ═══════════════════════════════════════════════════════════════════════════

export interface AiBinding<
	TAiModelList extends AiModelListType = AiModels,
> extends AiBindingOptions {
	type: "ai";
	/** @internal Carries type parameters for inference */
	__typeParams: [TAiModelList];
}

export interface AiSearchBinding extends AiSearchBindingOptions {
	type: "ai-search";
}

export interface AiSearchNamespaceBinding extends AiSearchNamespaceBindingOptions {
	type: "ai-search-namespace";
}

export interface AnalyticsEngineDatasetBinding extends AnalyticsEngineDatasetBindingOptions {
	type: "analytics-engine-dataset";
}

export interface ArtifactsBinding extends ArtifactsBindingOptions {
	type: "artifacts";
}

export interface AssetsBinding {
	type: "assets";
}

export interface BrowserBinding extends BrowserBindingOptions {
	type: "browser";
}

export interface D1Binding extends D1BindingOptions {
	type: "d1";
}

export interface DispatchNamespaceBinding extends DispatchNamespaceBindingOptions {
	type: "dispatch-namespace";
}

export interface FlagshipBinding extends FlagshipBindingOptions {
	type: "flagship";
}

export interface HyperdriveBinding extends HyperdriveBindingOptions {
	type: "hyperdrive";
}

export interface ImagesBinding extends ImagesBindingOptions {
	type: "images";
}

export interface JsonBinding<T extends Json> {
	type: "json";
	value: T;
}

export interface KvBinding<
	TKey extends string = string,
> extends KvBindingOptions {
	type: "kv";
	/** @internal Carries type parameters for inference */
	__typeParams: [TKey];
}

export interface LogfwdrBinding extends LogfwdrBindingOptions {
	type: "logfwdr";
}

export interface MediaBinding extends MediaBindingOptions {
	type: "media";
}

export interface MtlsCertificateBinding extends MtlsCertificateBindingOptions {
	type: "mtls-certificate";
}

export interface PipelineBinding<
	TRecord extends PipelineRecord = PipelineRecord,
> extends PipelineBindingOptions {
	type: "pipeline";
	/** @internal Carries type parameters for inference */
	__typeParams: [TRecord];
}

export interface QueueBinding<TBody = unknown> extends QueueBindingOptions {
	type: "queue";
	/** @internal Carries type parameters for inference */
	__typeParams: [TBody];
}

export interface RateLimitBinding extends RateLimitBindingOptions {
	type: "rate-limit";
}

export interface R2Binding extends R2BindingOptions {
	type: "r2";
}

export interface SecretBinding {
	type: "secret";
}

export interface SecretsStoreSecretBinding extends SecretsStoreSecretBindingOptions {
	type: "secrets-store-secret";
}

export interface SendEmailBinding extends SendEmailBindingOptions {
	type: "send-email";
}

export interface StreamBinding extends StreamBindingOptions {
	type: "stream";
}

export interface TextBinding<T extends string> {
	type: "text";
	value: T;
}

export interface UnsafeBinding {
	type: "unsafe";
	value: UnsafeBindingOptions;
}

export interface VectorizeBinding extends VectorizeBindingOptions {
	type: "vectorize";
}

export interface VersionMetadataBinding {
	type: "version-metadata";
}

export interface VpcServiceBinding extends VpcServiceBindingOptions {
	type: "vpc-service";
}

export type VpcNetworkBinding = VpcNetworkBindingOptions & {
	type: "vpc-network";
};

export interface WorkerLoaderBinding {
	type: "worker-loader";
}

// Cross-worker binding types (generic, with `__config` type for inference)

export interface DurableObjectBinding<
	TConfig,
	TWorkerName extends string,
	TExportName extends string,
> {
	type: "durable-object";
	workerName: TWorkerName;
	exportName: TExportName;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

export interface WorkerBinding<
	TConfig,
	TWorkerName extends string,
	TExportName extends string,
> {
	type: "worker";
	workerName: TWorkerName;
	exportName: TExportName;
	props?: Record<string, unknown>;
	remote?: boolean;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

export interface WorkflowBinding<
	TConfig,
	TWorkerName extends string,
	TExportName extends string,
> {
	type: "workflow";
	workerName: TWorkerName;
	exportName: TExportName;
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

/**
 * Returns valid exports for a Workflow binding.
 * For known Workers, returns the constrained union of Workflow exports.
 * For unknown workers in typed configs, returns `never`.
 * For untyped configs, returns `string` to allow any export name.
 */
type WorkflowExportName<
	TUnwrappedConfig,
	TName extends string,
> = TUnwrappedConfig extends { name: string }
	? TName extends InferWorkerName<TUnwrappedConfig>
		? InferExportsByType<
				ExtractConfigByName<TUnwrappedConfig, TName>,
				"workflow"
			>
		: never
	: string;

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
	json<T extends Json>(value: T): JsonBinding<T>;
	text<T extends string>(value: T): TextBinding<T>;

	// Other bindings
	ai<TAiModelList extends AiModelListType = AiModels>(
		options?: AiBindingOptions
	): AiBinding<TAiModelList>;
	aiSearch(options: AiSearchBindingOptions): AiSearchBinding;
	aiSearchNamespace(
		options: AiSearchNamespaceBindingOptions
	): AiSearchNamespaceBinding;
	analyticsEngineDataset(
		options?: AnalyticsEngineDatasetBindingOptions
	): AnalyticsEngineDatasetBinding;
	artifacts(options: ArtifactsBindingOptions): ArtifactsBinding;
	assets(): AssetsBinding;
	browser(options?: BrowserBindingOptions): BrowserBinding;
	d1(options?: D1BindingOptions): D1Binding;
	dispatchNamespace(
		options: DispatchNamespaceBindingOptions
	): DispatchNamespaceBinding;
	flagship(options: FlagshipBindingOptions): FlagshipBinding;
	hyperdrive(options: HyperdriveBindingOptions): HyperdriveBinding;
	images(options?: ImagesBindingOptions): ImagesBinding;
	kv<TKey extends string = string>(options?: KvBindingOptions): KvBinding<TKey>;
	logfwdr(options: LogfwdrBindingOptions): LogfwdrBinding;
	media(options?: MediaBindingOptions): MediaBinding;
	mtlsCertificate(
		options: MtlsCertificateBindingOptions
	): MtlsCertificateBinding;
	pipeline<TRecord extends PipelineRecord = PipelineRecord>(
		options: PipelineBindingOptions
	): PipelineBinding<TRecord>;
	queue<TBody = unknown>(options: QueueBindingOptions): QueueBinding<TBody>;
	rateLimit(options: RateLimitBindingOptions): RateLimitBinding;
	r2(options?: R2BindingOptions): R2Binding;
	secret(): SecretBinding;
	secretsStoreSecret(
		options: SecretsStoreSecretBindingOptions
	): SecretsStoreSecretBinding;
	sendEmail(options?: SendEmailBindingOptions): SendEmailBinding;
	stream(options?: StreamBindingOptions): StreamBinding;
	unsafe(options: UnsafeBindingOptions): UnsafeBinding;
	vectorize(options: VectorizeBindingOptions): VectorizeBinding;
	versionMetadata(): VersionMetadataBinding;
	vpcService(options: VpcServiceBindingOptions): VpcServiceBinding;
	vpcNetwork(options: VpcNetworkBindingOptions): VpcNetworkBinding;
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
	 * Create a Worker binding.
	 * `workerName` must match a known config's name (or any `string` for untyped bindings).
	 * `exportName` must be a valid `WorkerEntrypoint` export for the given Worker.
	 * If `exportName` is omitted, targets the default export.
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
	 * Create a Durable Object binding.
	 * `workerName` must match a known config's name (or any `string` for untyped bindings).
	 * `exportName` must be a valid `DurableObject` export for the given Worker.
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

	/**
	 * Create a Workflow binding.
	 * `workerName` must match a known config's name (or any `string` for untyped bindings).
	 * `exportName` must be a valid `WorkflowEntrypoint` export for the given Worker.
	 */
	workflow<
		TWorkerName extends WorkerName<TUnwrappedConfig>,
		TExportName extends WorkflowExportName<TUnwrappedConfig, TWorkerName>,
	>(options: {
		workerName: TWorkerName;
		exportName: TExportName;
		remote?: boolean;
	}): WorkflowBinding<
		ConfigOrUndefined<TUnwrappedConfig, TWorkerName>,
		TWorkerName,
		TExportName
	>;
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
		workflow: (options) => ({ type: "workflow", ...options }),
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
