import type { Json } from "./utils";
import type { PipelineRecord } from "cloudflare:pipelines";

// JSDoc is derived from `packages/workers-utils/src/config/environment.ts` — keep both in sync.

// ═══════════════════════════════════════════════════════════════════════════
// BINDING TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AgentMemoryBindingOptions {
	/** The user-chosen namespace name. Must exist in Cloudflare at deploy time. */
	namespace: string;
	/** Whether the Agent Memory binding should be remote in local development. */
	remote?: boolean;
}

/**
 * Agent Memory namespace binding. Each binding is scoped to a namespace and
 * allows agents to persist and recall memory.
 */
export interface AgentMemoryBinding extends AgentMemoryBindingOptions {
	type: "agent-memory";
}

interface AiBindingOptions {
	/** Whether the AI binding should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to the Workers AI project.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workers-ai
 */
export interface AiBinding extends AiBindingOptions {
	type: "ai";
}

/**
 * Binding to the Workers AI project.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workers-ai
 */
export interface TypedAiBinding<
	TAiModelList extends AiModelListType = AiModels,
> extends AiBinding {
	/** @internal Carries type parameters for inference */
	__typeParams: [TAiModelList];
}

interface AiSearchBindingOptions {
	/** The user-chosen instance name. Must exist in Cloudflare at deploy time. */
	name: string;
	/** Whether the AI Search instance binding should be remote in local development. */
	remote?: boolean;
}

/**
 * AI Search instance binding. Each binding is bound directly to a single
 * pre-existing instance within the "default" namespace.
 */
export interface AiSearchBinding extends AiSearchBindingOptions {
	type: "ai-search";
}

interface AiSearchNamespaceBindingOptions {
	/** The user-chosen namespace name. Must exist in Cloudflare at deploy time. */
	namespace: string;
	/** Whether the AI Search namespace binding should be remote in local development. */
	remote?: boolean;
}

/**
 * AI Search namespace binding. Each binding is scoped to a namespace and
 * allows dynamic instance CRUD within it.
 */
export interface AiSearchNamespaceBinding extends AiSearchNamespaceBindingOptions {
	type: "ai-search-namespace";
}

interface AnalyticsEngineDatasetBindingOptions {
	/** The name of this dataset to write to. */
	name?: string;
}

/**
 * Binding to an Analytics Engine dataset.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#analytics-engine-datasets
 */
export interface AnalyticsEngineDatasetBinding extends AnalyticsEngineDatasetBindingOptions {
	type: "analytics-engine-dataset";
}

interface ArtifactsBindingOptions {
	/** The namespace to use. */
	namespace: string;
	/** Whether to use the remote Artifacts service in local dev. */
	remote?: boolean;
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

interface BrowserBindingOptions {
	/** Whether the Browser binding should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to a headless browser usable from the Worker.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#browser-rendering
 */
export interface BrowserBinding extends BrowserBindingOptions {
	type: "browser";
}

interface D1BindingOptions {
	/** The UUID of this D1 database (not required). */
	id?: string;
	/** The name of this D1 database. */
	name?: string;
	/** Whether the D1 database should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to a D1 database.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases
 */
export interface D1Binding extends D1BindingOptions {
	type: "d1";
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

/**
 * Binding to a Workers for Platforms dispatch namespace.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#dispatch-namespace-bindings-workers-for-platforms
 */
export interface DispatchNamespaceBinding extends DispatchNamespaceBindingOptions {
	type: "dispatch-namespace";
}

interface DurableObjectBindingOptions {
	/** The name of the Worker that defines the Durable Object class. */
	workerName: string;
	/** The exported class name of the Durable Object. */
	exportName: string;
}

/**
 * Binding to a Durable Object class. `workerName` is the name of the Worker
 * that defines the class; `exportName` is the exported class name.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
 */
export interface DurableObjectBinding extends DurableObjectBindingOptions {
	type: "durable-object";
}

/**
 * Binding to a Durable Object class. `workerName` is the name of the Worker
 * that defines the class; `exportName` is the exported class name.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
 */
export interface TypedDurableObjectBinding<
	TConfig,
	TExportName extends string,
> extends DurableObjectBinding {
	workerName: string;
	exportName: TExportName;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

interface FlagshipBindingOptions {
	/** The Flagship app ID to bind to. */
	id: string;
	/** Set to `true` to suppress the remote binding warning in local dev. Flagship bindings are always remote. */
	remote?: boolean;
}

/** Binding to a Flagship feature-flag service. */
export interface FlagshipBinding extends FlagshipBindingOptions {
	type: "flagship";
}

interface HyperdriveBindingOptions {
	/** The ID of the Hyperdrive configuration. */
	id: string;
	/** The local database connection string used during local development. */
	localConnectionString?: string;
}

/**
 * Binding to a Hyperdrive configuration.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#hyperdrive
 */
export interface HyperdriveBinding extends HyperdriveBindingOptions {
	type: "hyperdrive";
}

interface ImagesBindingOptions {
	/** Whether the Images binding should be remote or not in local development. */
	remote?: boolean;
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
export interface JsonBinding<T extends Json = Json> {
	type: "json";
	/** The JSON value made available to the Worker. */
	value: T;
}

interface KvBindingOptions {
	/** The ID of the KV namespace. */
	id?: string;
	// TODO: name support not yet implemented
	// name?: string;
	/** Whether the KV namespace should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to a Workers KV namespace.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#kv-namespaces
 */
export interface KvBinding extends KvBindingOptions {
	type: "kv";
}

/**
 * Binding to a Workers KV namespace.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#kv-namespaces
 */
export interface TypedKvBinding<
	TKey extends string = string,
> extends KvBinding {
	/** @internal Carries type parameters for inference */
	__typeParams: [TKey];
}

interface LogfwdrBindingOptions {
	/** The destination for this logged message. */
	destination: string;
}

/** Binding for forwarding logs to logfwdr. */
export interface LogfwdrBinding extends LogfwdrBindingOptions {
	type: "logfwdr";
}

interface MediaBindingOptions {
	/** Whether the Media binding should be remote or not. */
	remote?: boolean;
}

/** Binding to Cloudflare Media Transformations. */
export interface MediaBinding extends MediaBindingOptions {
	type: "media";
}

interface MtlsCertificateBindingOptions {
	/** The UUID of the uploaded mTLS certificate. */
	id: string;
	/** Whether the mTLS fetcher should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to an uploaded mTLS certificate.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#mtls-certificates
 */
export interface MtlsCertificateBinding extends MtlsCertificateBindingOptions {
	type: "mtls-certificate";
}

interface PipelineBindingOptions {
	/** Name of the Pipeline to bind. */
	name: string;
	/** Whether the pipeline should be remote or not in local development. */
	remote?: boolean;
}

/** Binding to a Cloudflare Pipeline. */
export interface PipelineBinding extends PipelineBindingOptions {
	type: "pipeline";
}

/** Binding to a Cloudflare Pipeline. */
export interface TypedPipelineBinding<
	TRecord extends PipelineRecord = PipelineRecord,
> extends PipelineBinding {
	/** @internal Carries type parameters for inference */
	__typeParams: [TRecord];
}

interface QueueBindingOptions {
	/** The name of this Queue. */
	name: string;
	/** The number of seconds to wait before delivering a message. */
	deliveryDelay?: number;
	/** Whether the Queue producer should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Producer binding to a Cloudflare Queue.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
 */
export interface QueueBinding extends QueueBindingOptions {
	type: "queue";
}

/**
 * Producer binding to a Cloudflare Queue.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
 */
export interface TypedQueueBinding<TBody = unknown> extends QueueBinding {
	/** @internal Carries type parameters for inference */
	__typeParams: [TBody];
}

interface R2BindingOptions {
	/** The name of this R2 bucket at the edge. */
	name?: string;
	/** The jurisdiction that the bucket exists in. Default if not present. */
	jurisdiction?: string;
	/** Whether the R2 bucket should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to an R2 bucket.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#r2-buckets
 */
export interface R2Binding extends R2BindingOptions {
	type: "r2";
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

/** Binding to a rate limiter. */
export interface RateLimitBinding extends RateLimitBindingOptions {
	type: "rate-limit";
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

interface SecretsStoreSecretBindingOptions {
	/** ID of the secret store. */
	storeId: string;
	/** Name of the secret. */
	secretName: string;
}

/** Binding to a Secrets Store secret. */
export interface SecretsStoreSecretBinding extends SecretsStoreSecretBindingOptions {
	type: "secrets-store-secret";
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

/**
 * Binding for sending email from inside the Worker.
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#email-bindings
 */
export interface SendEmailBinding extends SendEmailBindingOptions {
	type: "send-email";
}

interface StreamBindingOptions {
	/** Whether the Stream binding should be remote or not in local development. */
	remote?: boolean;
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
export interface TextBinding<T extends string = string> {
	type: "text";
	/** The string value made available to the Worker. */
	value: T;
}

interface UnsafeBindingOptions {
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

/**
 * Escape-hatch binding for runtime features that aren't directly supported
 * by this configuration. Included in the Worker's upload metadata without
 * changes.
 */
export interface UnsafeBinding extends UnsafeBindingOptions {
	type: `unsafe:${string}`;
}

interface VectorizeBindingOptions {
	/** The name of the Vectorize index. */
	name: string;
	/** Whether the Vectorize index should be remote or not in local development. */
	remote?: boolean;
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

/** Binding to a VPC network. */
export type VpcNetworkBinding = VpcNetworkBindingOptions & {
	type: "vpc-network";
};

interface VpcServiceBindingOptions {
	/** The service ID of the VPC connectivity service. */
	id: string;
	/** Whether the VPC service is remote or not. */
	remote?: boolean;
}

/** Binding to a VPC service. */
export interface VpcServiceBinding extends VpcServiceBindingOptions {
	type: "vpc-service";
}

interface WebSearchBindingOptions {
	/** Whether the Web Search binding should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Cloudflare Web Search binding. There is exactly one shared web corpus, so
 * the binding is zero-config — only the variable name is required.
 */
export interface WebSearchBinding extends WebSearchBindingOptions {
	type: "web-search";
}

interface WorkerBindingOptions {
	/** The name of the bound Worker. */
	workerName: string;
	/** The named export to bind to (defaults to the default export). */
	exportName?: string;
	/** Optional properties that will be made available to the service via `ctx.props`. */
	props?: Record<string, unknown>;
	/** Whether the service binding should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Service binding (Worker-to-Worker). `workerName` is the name of the bound
 * Worker; `exportName` selects a named `WorkerEntrypoint` export (defaults to
 * the default export).
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
 */
export interface WorkerBinding extends WorkerBindingOptions {
	type: "worker";
}

/**
 * Service binding (Worker-to-Worker). `workerName` is the name of the bound
 * Worker; `exportName` selects a named `WorkerEntrypoint` export (defaults to
 * the default export).
 *
 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
 */
export interface TypedWorkerBinding<
	TConfig,
	TExportName extends string,
> extends WorkerBinding {
	workerName: string;
	exportName: TExportName;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

/** Binding to a Worker Loader. */
export interface WorkerLoaderBinding {
	type: "worker-loader";
}

interface WorkflowBindingOptions {
	/** The name of the Worker that defines the Workflow. */
	workerName: string;
	/** The exported class name of the Workflow. */
	exportName: string;
	/** Whether the Workflow binding should be remote or not in local development. */
	remote?: boolean;
}

/**
 * Binding to a Workflow. `workerName` is the name of the Worker that defines
 * the Workflow; `exportName` is the exported `WorkflowEntrypoint` class name.
 */
export interface WorkflowBinding extends WorkflowBindingOptions {
	type: "workflow";
}

/**
 * Binding to a Workflow. `workerName` is the name of the Worker that defines
 * the Workflow; `exportName` is the exported `WorkflowEntrypoint` class name.
 */
export interface TypedWorkflowBinding<
	TConfig,
	TExportName extends string,
> extends WorkflowBinding {
	workerName: string;
	exportName: TExportName;
	/** @internal Carries the config type for inference */
	__config: TConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// BINDINGS API
// ═══════════════════════════════════════════════════════════════════════════

export interface Bindings {
	/**
	 * Agent Memory namespace binding. Each binding is scoped to a namespace and
	 * allows agents to persist and recall memory.
	 */
	agentMemory(options: AgentMemoryBindingOptions): AgentMemoryBinding;
	/**
	 * Binding to the Workers AI project.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workers-ai
	 */
	ai<TAiModelList extends AiModelListType = AiModels>(
		options?: AiBindingOptions
	): TypedAiBinding<TAiModelList>;
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
	/**
	 * Binding to a Durable Object class. `workerName` is the name of the Worker
	 * that defines the class; `exportName` is the exported class name.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects
	 */
	durableObject(options: DurableObjectBindingOptions): DurableObjectBinding;
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
	 * Inline JSON value made available to the Worker on `env` under the
	 * binding name.
	 */
	json<T extends Json>(value: T): JsonBinding<T>;
	/**
	 * Binding to a Workers KV namespace.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#kv-namespaces
	 */
	kv<TKey extends string = string>(
		options?: KvBindingOptions
	): TypedKvBinding<TKey>;
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
	): TypedPipelineBinding<TRecord>;
	/**
	 * Producer binding to a Cloudflare Queue.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#queues
	 */
	queue<TBody = unknown>(
		options: QueueBindingOptions
	): TypedQueueBinding<TBody>;
	/**
	 * Binding to an R2 bucket.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#r2-buckets
	 */
	r2(options?: R2BindingOptions): R2Binding;
	/** Binding to a rate limiter. */
	rateLimit(options: RateLimitBindingOptions): RateLimitBinding;
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
	 * Inline string value made available to the Worker on `env` under the
	 * binding name.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#environment-variables
	 */
	text<T extends string>(value: T): TextBinding<T>;
	/**
	 * Binding to a Vectorize index.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#vectorize-indexes
	 */
	vectorize(options: VectorizeBindingOptions): VectorizeBinding;
	/** Binding to the Worker version's metadata. */
	versionMetadata(): VersionMetadataBinding;
	/** Binding to a VPC network. */
	vpcNetwork(options: VpcNetworkBindingOptions): VpcNetworkBinding;
	/** Binding to a VPC service. */
	vpcService(options: VpcServiceBindingOptions): VpcServiceBinding;
	/**
	 * Cloudflare Web Search binding. There is exactly one shared web corpus, so
	 * the binding is zero-config — only the variable name is required.
	 */
	webSearch(options?: WebSearchBindingOptions): WebSearchBinding;
	/**
	 * Service binding (Worker-to-Worker). `workerName` is the name of the bound
	 * Worker; `exportName` selects a named `WorkerEntrypoint` export (defaults to
	 * the default export).
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#service-bindings
	 */
	worker(options: WorkerBindingOptions): WorkerBinding;
	/** Binding to a Worker Loader. */
	workerLoader(): WorkerLoaderBinding;
	// TODO: re-enable when workflow bindings return.
	// /**
	//  * Create a Workflow binding.
	//  * `workerName` must match a known config's name (or any `string` for untyped bindings).
	//  * `exportName` must be a valid `WorkflowEntrypoint` export for the given Worker.
	//  */
	// workflow(options: WorkflowBindingOptions): WorkflowBinding;
}

export const bindings = {
	agentMemory: (options) => ({ type: "agent-memory", ...options }),
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
	vectorize: (options) => ({ type: "vectorize", ...options }),
	versionMetadata: () => ({ type: "version-metadata" }),
	vpcService: (options) => ({ type: "vpc-service", ...options }),
	vpcNetwork: (options) => ({ type: "vpc-network", ...options }),
	webSearch: (options) => ({ type: "web-search", ...options }),
	worker: (options) => ({ type: "worker", ...options }),
	workerLoader: () => ({ type: "worker-loader" }),
	// TODO: re-enable when workflow bindings return.
	// workflow: (options) => ({ type: "workflow", ...options }),
} as Bindings;
