import type { Config } from "./config";
import type {
	ContainerApp,
	ContainerEngine,
	CustomDomainRoute,
	DurableObjectMigration,
	Observability,
	Rule,
	TailConsumer,
	ZoneIdRoute,
	ZoneNameRoute,
} from "./config/environment";
import type {
	CfAIBinding,
	CfAnalyticsEngineDataset,
	CfBrowserBinding,
	CfD1Database,
	CfDispatchNamespace,
	CfDurableObject,
	CfDurableObjectMigrations,
	CfHelloWorld,
	CfHyperdrive,
	CfImagesBinding,
	CfKvNamespace,
	CfLogfwdrBinding,
	CfMediaBinding,
	CfModule,
	CfMTlsCertificate,
	CfPipeline,
	CfPlacement,
	CfQueue,
	CfR2Bucket,
	CfRateLimit,
	CfSecretsStoreSecrets,
	CfSendEmailBindings,
	CfService,
	CfTailConsumer,
	CfUnsafe,
	CfUnsafeBinding,
	CfUserLimits,
	CfVectorize,
	CfVpcService,
	CfWorkerLoader,
	CfWorkflow,
} from "./worker";
import type { AssetConfig } from "@cloudflare/workers-shared";

export type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| { [id: string]: Json };

export type WorkerMetadataBinding =
	// If you add any new binding types here, also add it to safeBindings
	// under validateUnsafeBinding in config/validation.ts

	// Inherit is _not_ in safeBindings because it is here for API use only
	// wrangler supports this per type today through keep_bindings
	| { type: "inherit"; name: string }
	| { type: "plain_text"; name: string; text: string }
	| { type: "secret_text"; name: string; text: string }
	| { type: "json"; name: string; json: Json }
	| { type: "wasm_module"; name: string; part: string }
	| { type: "text_blob"; name: string; part: string }
	| { type: "browser"; name: string; raw?: boolean }
	| { type: "ai"; name: string; staging?: boolean; raw?: boolean }
	| { type: "images"; name: string; raw?: boolean }
	| { type: "version_metadata"; name: string }
	| { type: "data_blob"; name: string; part: string }
	| { type: "kv_namespace"; name: string; namespace_id: string; raw?: boolean }
	| { type: "media"; name: string }
	| {
			type: "send_email";
			name: string;
			destination_address?: string;
			allowed_destination_addresses?: string[];
			allowed_sender_addresses?: string[];
	  }
	| {
			type: "durable_object_namespace";
			name: string;
			class_name: string;
			script_name?: string;
			environment?: string;
			namespace_id?: string;
	  }
	| {
			type: "workflow";
			name: string;
			workflow_name: string;
			class_name: string;
			script_name?: string;
			raw?: boolean;
	  }
	| {
			type: "queue";
			name: string;
			queue_name: string;
			delivery_delay?: number;
			raw?: boolean;
	  }
	| {
			type: "r2_bucket";
			name: string;
			bucket_name: string;
			jurisdiction?: string;
			raw?: boolean;
	  }
	| {
			type: "d1";
			name: string;
			id: string;
			internalEnv?: string;
			raw?: boolean;
	  }
	| {
			type: "vectorize";
			name: string;
			index_name: string;
			internalEnv?: string;
			raw?: boolean;
	  }
	| { type: "hyperdrive"; name: string; id: string }
	| {
			type: "service";
			name: string;
			service: string;
			environment?: string;
			entrypoint?: string;
			cross_account_grant?: string;
	  }
	| { type: "analytics_engine"; name: string; dataset?: string }
	| {
			type: "dispatch_namespace";
			name: string;
			namespace: string;
			outbound?: {
				worker: {
					service: string;
					environment?: string;
				};
				params?: { name: string }[];
			};
	  }
	| { type: "mtls_certificate"; name: string; certificate_id: string }
	| { type: "pipelines"; name: string; pipeline: string }
	| {
			type: "secrets_store_secret";
			name: string;
			store_id: string;
			secret_name: string;
	  }
	| {
			type: "unsafe_hello_world";
			name: string;
			enable_timer?: boolean;
	  }
	| {
			type: "ratelimit";
			name: string;
			namespace_id: string;
			simple: { limit: number; period: 10 | 60 };
	  }
	| { type: "vpc_service"; name: string; service_id: string }
	| {
			type: "worker_loader";
			name: string;
	  }
	| {
			type: "logfwdr";
			name: string;
			destination: string;
	  }
	| { type: "assets"; name: string };

export type AssetConfigMetadata = {
	html_handling?: AssetConfig["html_handling"];
	not_found_handling?: AssetConfig["not_found_handling"];
	run_worker_first?: boolean | string[];
	_redirects?: string;
	_headers?: string;
};

// for PUT /accounts/:accountId/workers/scripts/:scriptName
type WorkerMetadataPut = {
	/** The name of the entry point module. Only exists when the worker is in the ES module format */
	main_module?: string;
	/** The name of the entry point module. Only exists when the worker is in the service-worker format */
	body_part?: string;
	compatibility_date?: string;
	compatibility_flags?: string[];
	usage_model?: "bundled" | "unbound";
	migrations?: CfDurableObjectMigrations;
	capnp_schema?: string;
	bindings: WorkerMetadataBinding[];
	keep_bindings?: (
		| WorkerMetadataBinding["type"]
		| "secret_text"
		| "secret_key"
	)[];
	logpush?: boolean;
	placement?: CfPlacement;
	tail_consumers?: CfTailConsumer[];
	streaming_tail_consumers?: CfTailConsumer[];
	limits?: CfUserLimits;

	assets?: {
		jwt: string;
		config?: AssetConfigMetadata;
	};
	observability?: Observability | undefined;
	containers?: { class_name: string }[];
	// Allow unsafe.metadata to add arbitrary properties at runtime
	[key: string]: unknown;
};

// for POST /accounts/:accountId/workers/:workerName/versions
type WorkerMetadataVersionsPost = WorkerMetadataPut & {
	annotations?: Record<string, string>;
};

export type WorkerMetadata = WorkerMetadataPut | WorkerMetadataVersionsPost;

export type ServiceMetadataRes = {
	id: string;
	default_environment: {
		environment: string;
		created_on: string;
		modified_on: string;
		script: {
			id: string;
			tag: string;
			tags: string[];
			etag: string;
			handlers: string[];
			modified_on: string;
			created_on: string;
			migration_tag: string;
			usage_model: "bundled" | "unbound";
			limits: {
				cpu_ms: number;
				subrequests: number;
			};
			compatibility_date: string;
			compatibility_flags: string[];
			last_deployed_from?: "wrangler" | "dash" | "api";
			placement_mode?: "smart";
			tail_consumers?: TailConsumer[];
			observability?: Observability;
		};
	};
	created_on: string;
	modified_on: string;
	usage_model: "bundled" | "unbound";
	environments: [
		{
			environment: string;
			created_on: string;
			modified_on: string;
		},
	];
};

export type ServiceFetch = (request: Request) => Promise<Response> | Response;

export type File<Contents = string, Path = string> =
	| { path: Path } // `path` resolved relative to cwd
	| { contents: Contents; path?: Path }; // `contents` used instead, `path` can be specified if needed e.g. for module resolution
export type BinaryFile = File<Uint8Array>; // Note: Node's `Buffer`s are instances of `Uint8Array`

type QueueConsumer = NonNullable<Config["queues"]["consumers"]>[number];

export type Trigger =
	| { type: "workers.dev" }
	| { type: "route"; pattern: string } // SimpleRoute
	| ({ type: "route" } & ZoneIdRoute)
	| ({ type: "route" } & ZoneNameRoute)
	| ({ type: "route" } & CustomDomainRoute)
	| { type: "cron"; cron: string }
	| ({ type: "queue-consumer" } & QueueConsumer);

type BindingOmit<T> = Omit<T, "binding">;
type NameOmit<T> = Omit<T, "name">;
export type Binding =
	| {
			type: "plain_text";
			value: string;
			/**
			 * Hide this environment variable in output as it may be sensitive
			 * This is a @deprecated feature to support current Wrangler behaviour, and sensitive
			 * variables should be marked as `type: secret_text` in future
			 */
			hidden?: boolean;
	  }
	| { type: "secret_text"; value: string }
	| { type: "json"; value: Json }
	| ({ type: "kv_namespace" } & BindingOmit<CfKvNamespace>)
	| ({ type: "send_email" } & NameOmit<CfSendEmailBindings>)
	| { type: "wasm_module"; source: BinaryFile }
	| { type: "text_blob"; source: File }
	| ({ type: "browser" } & BindingOmit<CfBrowserBinding>)
	| ({ type: "ai" } & BindingOmit<CfAIBinding>)
	| ({ type: "images" } & BindingOmit<CfImagesBinding>)
	| { type: "version_metadata" }
	| { type: "data_blob"; source: BinaryFile }
	| ({ type: "durable_object_namespace" } & NameOmit<CfDurableObject>)
	| ({ type: "workflow" } & BindingOmit<CfWorkflow>)
	| ({ type: "queue" } & BindingOmit<CfQueue>)
	| ({ type: "r2_bucket" } & BindingOmit<CfR2Bucket>)
	| ({ type: "d1" } & BindingOmit<CfD1Database>)
	| ({ type: "vectorize" } & BindingOmit<CfVectorize>)
	| ({ type: "hyperdrive" } & BindingOmit<CfHyperdrive>)
	| ({ type: "service" } & BindingOmit<CfService>)
	| { type: "fetcher"; fetcher: ServiceFetch }
	| ({ type: "analytics_engine" } & BindingOmit<CfAnalyticsEngineDataset>)
	| ({ type: "dispatch_namespace" } & BindingOmit<CfDispatchNamespace>)
	| ({ type: "mtls_certificate" } & BindingOmit<CfMTlsCertificate>)
	| ({ type: "pipeline" } & BindingOmit<CfPipeline>)
	| ({ type: "secrets_store_secret" } & BindingOmit<CfSecretsStoreSecrets>)
	| ({ type: "logfwdr" } & NameOmit<CfLogfwdrBinding>)
	| ({ type: "unsafe_hello_world" } & BindingOmit<CfHelloWorld>)
	| ({ type: "ratelimit" } & NameOmit<CfRateLimit>)
	| ({ type: "worker_loader" } & BindingOmit<CfWorkerLoader>)
	| ({ type: "vpc_service" } & BindingOmit<CfVpcService>)
	| ({ type: "media" } & BindingOmit<CfMediaBinding>)
	| ({ type: `unsafe_${string}` } & Omit<CfUnsafeBinding, "name" | "type">)
	| { type: "assets" }
	| { type: "inherit" };

// ============================================================================
// Hook utilities
// ============================================================================

export type HookValues = string | number | boolean | object | undefined | null;
export type Hook<T extends HookValues, Args extends unknown[] = []> =
	| T
	| ((...args: Args) => T);
export type AsyncHook<T extends HookValues, Args extends unknown[] = []> =
	| Hook<T, Args>
	| Hook<Promise<T>, Args>;

// ============================================================================
// Auth types (moved from wrangler)
// ============================================================================

export type ApiCredentials =
	| {
			apiToken: string;
	  }
	| {
			authKey: string;
			authEmail: string;
	  };

export interface CfAccount {
	/**
	 * An API token.
	 *
	 * @link https://api.cloudflare.com/#user-api-tokens-properties
	 */
	apiToken: ApiCredentials;
	/**
	 * An account ID.
	 */
	accountId: string;
}

// ============================================================================
// Compat mode (copied from miniflare to avoid dep)
// ============================================================================

export type NodeJSCompatMode = "als" | "v1" | "v2" | null;

// ============================================================================
// Log level
// ============================================================================

export type LogLevel = "debug" | "info" | "log" | "warn" | "error" | "none";

// ============================================================================
// StartDevWorkerInput
// ============================================================================

export interface StartDevWorkerInput {
	/** The name of the worker. */
	name?: string;
	/**
	 * The javascript or typescript entry-point of the worker.
	 * This is the `main` property of a Wrangler configuration file.
	 */
	entrypoint?: string;
	/** The configuration path of the worker. */
	config?: string;

	/** The compatibility date for the workerd runtime. */
	compatibilityDate?: string;
	/** The compatibility flags for the workerd runtime. */
	compatibilityFlags?: string[];

	/** Specify the compliance region mode of the Worker. */
	complianceRegion?: Config["compliance_region"];

	/** Configuration for Python modules. */
	pythonModules?: {
		/** A list of glob patterns to exclude files from the python_modules directory when bundling. */
		exclude?: string[];
	};

	env?: string;

	/**
	 * An array of paths to the .env files to load for this worker, relative to the project directory.
	 *
	 * If not specified, defaults to the standard `.env` files as given by `getDefaultEnvFiles()`.
	 * The project directory is where the Wrangler configuration file is located or the current working directory otherwise.
	 */
	envFiles?: string[];

	/**
	 * Default bindings that can be overridden by config bindings.
	 * Useful for injecting environment-specific defaults like CF_PAGES variables.
	 */
	defaultBindings?: Record<string, Extract<Binding, { type: "plain_text" }>>;
	/** The bindings available to the worker. The specified binding type will be exposed to the worker on the `env` object under the same key. */
	bindings?: Record<string, Binding>; // Type level constraint for bindings not sharing names
	migrations?: DurableObjectMigration[];
	containers?: ContainerApp[];
	/** The triggers which will cause the worker's exported default handlers to be called. */
	triggers?: Trigger[];

	tailConsumers?: CfTailConsumer[];
	streamingTailConsumers?: CfTailConsumer[];

	/**
	 * Whether Wrangler should send usage metrics to Cloudflare for this project.
	 *
	 * When defined this will override any user settings.
	 * Otherwise, Wrangler will use the user's preference.
	 */
	sendMetrics?: boolean;

	/** Options applying to the worker's build step. Applies to deploy and dev. */
	build?: {
		/** Whether the worker and its dependencies are bundled. Defaults to true. */
		bundle?: boolean;

		additionalModules?: CfModule[];

		findAdditionalModules?: boolean;
		processEntrypoint?: boolean;
		/** Specifies types of modules matched by globs. */
		moduleRules?: Rule[];
		/** Replace global identifiers with constant expressions, e.g. { debug: 'true', version: '"1.0.0"' }. Only takes effect if bundle: true. */
		define?: Record<string, string>;
		/** Alias modules */
		alias?: Record<string, string>;
		/** Whether the bundled worker is minified. Only takes effect if bundle: true. */
		minify?: boolean;
		/** Whether to keep function names after JavaScript transpilations. */
		keepNames?: boolean;
		/** Options controlling a custom build step. */
		custom?: {
			/** Custom shell command to run before bundling. Runs even if bundle. */
			command?: string;
			/** The cwd to run the command in. */
			workingDirectory?: string;
			/** Filepath(s) to watch for changes. Upon changes, the command will be rerun. */
			watch?: string | string[];
		};
		jsxFactory?: string;
		jsxFragment?: string;
		tsconfig?: string;
		// HACK: Resolving the nodejs compat mode is complex and fraught with backwards-compat concerns
		nodejsCompatMode?: Hook<NodeJSCompatMode, [Config]>;

		moduleRoot?: string;
	};

	/** Options applying to the worker's development preview environment. */
	dev?: {
		/** Options applying to the worker's inspector server. False disables the inspector server. */
		inspector?: { hostname?: string; port?: number; secure?: boolean } | false;
		/** Whether the worker runs on the edge or locally. This has several options:
		 *   - true | "minimal": Run your Worker's code & bindings in a remote preview session, optionally using minimal mode as an internal detail
		 *   - false: Run your Worker's code & bindings in a local simulator
		 *   - undefined (default): Run your Worker's code locally, and any configured remote bindings remotely
		 */
		remote?: boolean | "minimal";
		/** Cloudflare Account credentials. Can be provided upfront or as a function which will be called only when required. */
		auth?: AsyncHook<CfAccount, [Pick<Config, "account_id">]>; // provide config.account_id as a hook param
		/** Whether local storage (KV, Durable Objects, R2, D1, etc) is persisted. You can also specify the directory to persist data to. */
		persist?: string;
		/** Controls which logs are logged. */
		logLevel?: LogLevel;
		/** Whether the worker server restarts upon source/config file changes. */
		watch?: boolean;
		/** Whether a script tag is inserted on text/html responses which will reload the page upon file changes. Defaults to false. */
		liveReload?: boolean;

		/** The local address to reach your worker. Applies to remote: true (remote mode) and remote: false (local mode). */
		server?: {
			hostname?: string; // --ip
			port?: number; // --port
			secure?: boolean; // --local-protocol==https
			httpsKeyPath?: string;
			httpsCertPath?: string;
		};
		/** Controls what request.url looks like inside the worker. */
		origin?: { hostname?: string; secure?: boolean }; // hostname: --host (remote)/--local-upstream (local), secure: --upstream-protocol
		testScheduled?: boolean;

		/** Treat this as the primary worker in a multiworker setup (i.e. the first Worker in Miniflare's options) */
		multiworkerPrimary?: boolean;

		containerBuildId?: string;
		/** Whether to build and connect to containers during local dev. Requires Docker daemon to be running. Defaults to true. */
		enableContainers?: boolean;

		/** Path to the dev registry directory */
		registry?: string;

		/** Path to the docker executable. Defaults to 'docker' */
		dockerPath?: string;

		/** Options for the container engine */
		containerEngine?: ContainerEngine;

		/** Re-generate your worker types when your Wrangler configuration file changes */
		generateTypes?: boolean;
	};
	legacy?: {
		site?: Hook<Config["site"], [Config]>;
		useServiceEnvironments?: boolean;
	};
	unsafe?: Omit<CfUnsafe, "bindings">;
	assets?: string;

	experimental?: {
		tailLogs: boolean;
	};
}
