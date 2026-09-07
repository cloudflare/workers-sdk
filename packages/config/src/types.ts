/**
 * The hand-authored public configuration type for `@cloudflare/config`.
 *
 * JSDoc on each field is derived from the equivalent field in the Wrangler
 * config types in `packages/workers-utils/src/config/environment.ts`. When
 * editing either file, keep the prose in sync.
 */

import type {
	AgentMemoryBinding,
	AiBinding,
	AiSearchBinding,
	AiSearchNamespaceBinding,
	AnalyticsEngineDatasetBinding,
	ArtifactsBinding,
	AssetsBinding,
	BrowserBinding,
	D1Binding,
	DispatchNamespaceBinding,
	DurableObjectBinding,
	FlagshipBinding,
	HyperdriveBinding,
	ImagesBinding,
	JsonBinding,
	KvBinding,
	LogfwdrBinding,
	MediaBinding,
	MtlsCertificateBinding,
	PipelineBinding,
	QueueBinding,
	R2Binding,
	RateLimitBinding,
	SecretBinding,
	SecretsStoreSecretBinding,
	SendEmailBinding,
	StreamBinding,
	TextBinding,
	UnsafeBinding,
	VectorizeBinding,
	VersionMetadataBinding,
	VpcNetworkBinding,
	VpcServiceBinding,
	WebSearchBinding,
	WorkerBinding,
	WorkerLoaderBinding,
	// TODO: re-enable when workflow bindings return.
	// WorkflowBinding,
} from "./bindings";
import type {
	DurableObjectDeletedExport,
	DurableObjectExpectingTransferExport,
	DurableObjectCreatedExport,
	DurableObjectRenamedExport,
	DurableObjectTransferredExport,
	WorkerEntrypointExport,
} from "./exports";
import type { WorkerModule } from "./inference";
import type {
	ConnectTrigger,
	EmailTrigger,
	FetchTrigger,
	QueueConsumerTrigger,
	ScheduledTrigger,
} from "./triggers";

/**
 * Union of all binding definitions accepted in `env`.
 */
type Binding =
	| AgentMemoryBinding
	| AiBinding
	| AiSearchBinding
	| AiSearchNamespaceBinding
	| AnalyticsEngineDatasetBinding
	| ArtifactsBinding
	| AssetsBinding
	| BrowserBinding
	| D1Binding
	| DispatchNamespaceBinding
	| DurableObjectBinding
	| FlagshipBinding
	| HyperdriveBinding
	| ImagesBinding
	| JsonBinding
	| KvBinding
	| LogfwdrBinding
	| MediaBinding
	| MtlsCertificateBinding
	| PipelineBinding
	| QueueBinding
	| R2Binding
	| RateLimitBinding
	| SecretBinding
	| SecretsStoreSecretBinding
	| SendEmailBinding
	| StreamBinding
	| TextBinding
	| UnsafeBinding
	| VectorizeBinding
	| VersionMetadataBinding
	| VpcNetworkBinding
	| VpcServiceBinding
	| WebSearchBinding
	| WorkerBinding
	| WorkerLoaderBinding;
// TODO: re-enable when workflow bindings return.
// | WorkflowBinding;

/**
 * Union of all trigger definitions accepted in `triggers`.
 */
type Trigger =
	| ConnectTrigger
	| EmailTrigger
	| FetchTrigger
	| QueueConsumerTrigger
	| ScheduledTrigger;

/**
 * Union of all export definitions accepted in `exports`. Worker entries
 * configure WorkerEntrypoint exports. Durable Object entries configure live
 * classes and tombstone lifecycle operations.
 */
type Export =
	| DurableObjectCreatedExport
	| DurableObjectDeletedExport
	| DurableObjectRenamedExport
	| DurableObjectTransferredExport
	| DurableObjectExpectingTransferExport
	| WorkerEntrypointExport;
// TODO: support Workflows

/**
 * Container application configuration. This is the input shape passed to
 * `defineContainer`.
 *
 * Fields are validated at runtime by `InputContainerSchema`.
 */
export interface ContainerConfig {
	/**
	 * Discriminates this config as a Container config.
	 *
	 * Injected automatically by `defineContainer`; only needs to be written by
	 * hand when authoring a raw config object without the helper.
	 */
	type: "container";

	/**
	 * Name of the application.
	 *
	 * This is also the identifier used to reference the Container from a Durable
	 * Object's `exports` entry via its `container` field.
	 */
	name: string;

	/**
	 * A date in the form yyyy-mm-dd that determines which compatibility behavior
	 * changes apply to the Container application.
	 */
	compatibilityDate: string;

	/**
	 * The image to build or deploy. Specify either a Dockerfile to build or a
	 * reference to an existing image.
	 */
	image:
		| {
				/** The path to a Dockerfile. */
				dockerfile: string;
				/**
				 * Build context of the application.
				 *
				 * @default The directory containing `dockerfile`.
				 */
				buildContext?: string;
				/**
				 * Image variables available to the image at build time only.
				 * For runtime environment variables, see
				 * https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/
				 */
				buildVars?: Record<string, string>;
		  }
		| {
				/** Reference to an existing image. */
				reference: string;
		  };

	/** Number of maximum application instances. */
	maxInstances?: number;

	/**
	 * The instance type to be used for the Container.
	 * Select from one of the following named instance types:
	 *
	 * - lite: 1/16 vCPU, 256 MiB memory, and 2 GB disk
	 * - basic: 1/4 vCPU, 1 GiB memory, and 4 GB disk
	 * - standard-1: 1/2 vCPU, 4 GiB memory, and 8 GB disk
	 * - standard-2: 1 vCPU, 6 GiB memory, and 12 GB disk
	 * - standard-3: 2 vCPU, 8 GiB memory, and 16 GB disk
	 * - standard-4: 4 vCPU, 12 GiB memory, and 20 GB disk
	 *
	 * Customers on an enterprise plan have the additional option to set custom
	 * limits.
	 *
	 * @default "lite"
	 */
	instanceType?:
		| "basic"
		| "lite"
		| "standard-1"
		| "standard-2"
		| "standard-3"
		| "standard-4"
		| {
				/** @default 0.0625 (1/16 vCPU) */
				vcpu?: number;
				/** @default 256 MiB */
				memoryMib?: number;
				/** @default 2 GB */
				diskMb?: number;
		  };

	/**
	 * The scheduling policy of the application.
	 *
	 * @default "default"
	 */
	schedulingPolicy?: "default" | "moon" | "regional";

	ssh?: {
		/**
		 * If enabled, users with write access to the Container application can
		 * connect to it over SSH.
		 *
		 * @default false
		 */
		enabled: boolean;
		/**
		 * Port that the SSH service is running on.
		 *
		 * @default 22
		 */
		port?: number;
	};

	/** SSH public keys to put in the Container's authorized_keys file. */
	authorizedKeys?: Array<{ name: string; publicKey: string }>;

	/**
	 * Trusted user CA keys to put in the Container's trusted_user_ca_keys file.
	 */
	trustedUserCaKeys?: Array<{ name?: string; publicKey: string }>;

	/** Scheduling constraints for Container placement. */
	constraints?: {
		/** Limit Container placement to specific geographic regions. */
		regions?: Array<
			"ENAM" | "WNAM" | "EEUR" | "WEUR" | "APAC" | "SAM" | "ME" | "OC" | "AFR"
		>;
		/** Restrict Containers to compliance boundaries. */
		jurisdiction?: "eu" | "fedramp";
		/** @hidden */
		cities?: string[];
		/** @hidden */
		tiers?: number[];
	};

	/**
	 * Scheduling affinities.
	 *
	 * @hidden
	 */
	affinities?: {
		colocation?: "datacenter";
		hardwareGeneration?: "highest-overall-performance";
	};

	rollout?: {
		/**
		 * How a rollout should be created. It supports the following modes:
		 *
		 * - full-auto: The Container application will be rolled out fully
		 *   automatically.
		 * - none: The Container application will not have a rollout or update.
		 * - full-manual: The Container application will be rolled out by manually
		 *   progressing through the rollout steps.
		 *
		 * @default "full-auto"
		 * @hidden
		 */
		kind?: "full-auto" | "none" | "full-manual";
		/**
		 * Configures what percentage of instances should be updated at each step of
		 * a rollout. You can specify this as a single number or an array of numbers.
		 *
		 * If this is a single number, each step will progress by that percentage.
		 * The options are 5, 10, 20, 25, 50, or 100.
		 *
		 * If this is an array, each step specifies the cumulative rollout progress.
		 * The final step must be 100.
		 *
		 * @default [10, 100]
		 */
		stepPercentage?: number | number[];
		/**
		 * Configures the grace period, in seconds, for active instances before they
		 * are shut down during a rollout.
		 *
		 * @default 0
		 */
		activeGracePeriod?: number;
	};

	/** Configures observability for Container instances. */
	observability?: {
		/** Whether observability is enabled. */
		enabled?: boolean;
		logs?: {
			/** Whether log collection is enabled. */
			enabled?: boolean;
		};
		/** Percentage of Container instances targeted for observability (0–100). */
		targetInstancePercentage?: number;
		/** Non-negative integer number of Container instances targeted. */
		targetInstanceCount?: number;
	};

	/**
	 * Directly passed to the API without client-side validation or
	 * transformation.
	 *
	 * @hidden
	 */
	unsafe?: Record<string, unknown>;
}

/**
 * Worker configuration. This is the input shape passed to
 * [`defineWorker`](https://developers.cloudflare.com/workers/wrangler/configuration/).
 *
 * Fields are validated at runtime by `InputWorkerSchema` and normalised before
 * being passed to downstream tooling.
 */
export interface WorkerConfig {
	/**
	 * Discriminates this config as a Worker config.
	 *
	 * Injected automatically by `defineWorker`; only needs to be written by
	 * hand when authoring a raw config object without the helper.
	 */
	type: "worker";

	/**
	 * The name of your Worker.
	 */
	name: string;

	/**
	 * A date in the form yyyy-mm-dd, which will be used to determine
	 * which version of the Workers runtime is used.
	 *
	 * More details at https://developers.cloudflare.com/workers/configuration/compatibility-dates
	 */
	compatibilityDate: string;

	/**
	 * A list of flags that enable features from upcoming features of
	 * the Workers runtime, usually used together with `compatibilityDate`.
	 *
	 * More details at https://developers.cloudflare.com/workers/configuration/compatibility-flags/
	 *
	 * @default []
	 */
	compatibilityFlags?: string[];

	/**
	 * The entrypoint module that will be executed.
	 *
	 * May be either a path string (e.g. `"./src/index.ts"`) or a module
	 * namespace imported with the `cf-worker` import attribute.
	 *
	 * @example
	 * ```ts
	 * import * as entrypoint from "./src" with { type: "cf-worker" };
	 * export default defineWorker({ entrypoint });
	 * ```
	 */
	entrypoint?: string | WorkerModule;

	/**
	 * Specify the directory of static assets to deploy/serve.
	 *
	 * More details at https://developers.cloudflare.com/workers/frameworks/
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#assets
	 */
	assets?: {
		/** How to handle HTML requests. */
		htmlHandling?:
			| "auto-trailing-slash"
			| "drop-trailing-slash"
			| "force-trailing-slash"
			| "none";

		/** How to handle requests that do not match an asset. */
		notFoundHandling?: "single-page-application" | "404-page" | "none";

		/**
		 * Matches will be routed to the User Worker, and matches to negative rules will go to the Asset Worker.
		 *
		 * Can also be `true`, indicating that every request should be routed to the User Worker.
		 */
		runWorkerFirst?: string[] | boolean;
	};

	/**
	 * Custom domains that your Worker should be published to.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#types-of-routes
	 */
	domains?: string[];

	/**
	 * Event triggers — fetch routes, queue consumers, cron schedules, Email
	 * Routing addresses, and raw sockets — that invoke this Worker.
	 * Construct entries with `triggers.fetch(...)`, `triggers.queue(...)`,
	 * `triggers.scheduled(...)`, `triggers.email(...)`, or
	 * `triggers.connect(...)`.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#triggers
	 */
	triggers?: Trigger[];

	/**
	 * A list of Tail Workers that are bound to this Worker.
	 *
	 * `@cloudflare/config` unifies regular and streaming tail consumers under
	 * a single field; pass `streaming: true` to forward streaming tail events.
	 *
	 * @default []
	 */
	tailConsumers?: Array<{
		/** The name of the service tail events will be forwarded to. */
		worker: string;
		/** Whether to stream tail events in real time. */
		streaming?: boolean;
	}>;

	/**
	 * Specify the cache behavior of the Worker.
	 */
	cache?: {
		/** If cache is enabled for this Worker. */
		enabled: boolean;
		/** Whether cached assets may be reused across Worker versions. */
		crossVersionCache?: boolean;
	};

	/**
	 * Specify how the Worker should be located to minimize round-trip time.
	 *
	 * More details: https://developers.cloudflare.com/workers/platform/smart-placement/
	 */
	placement?:
		| { mode: "off" | "smart"; hint?: string }
		| { mode?: "targeted"; region: string }
		| { mode?: "targeted"; host: string }
		| { mode?: "targeted"; hostname: string };

	/**
	 * Specify limits for runtime behavior.
	 * Only supported for the "standard" Usage Model.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#limits
	 */
	limits?: {
		/** Maximum allowed CPU time for a Worker's invocation in milliseconds. */
		cpuMs?: number;
		/** Maximum allowed number of fetch requests that a Worker's invocation can execute. */
		subrequests?: number;
	};

	/**
	 * Send Trace Events from this Worker to Workers Logpush.
	 *
	 * This will not configure a corresponding Logpush job automatically.
	 *
	 * For more information about Workers Logpush, see:
	 * https://blog.cloudflare.com/logpush-for-workers/
	 */
	logpush?: boolean;

	/**
	 * Specify the observability behavior of the Worker.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#observability
	 */
	observability?: {
		/** If observability is enabled for this Worker. */
		enabled?: boolean;
		/** The sampling rate. */
		headSamplingRate?: number;
		/**
		 * Whether query strings are removed from request URLs in logs and traces.
		 *
		 * @default false
		 */
		redactQueryString?: boolean;
		logs?: {
			enabled?: boolean;
			/** The sampling rate. */
			headSamplingRate?: number;
			/** Set to false to disable invocation logs. */
			invocationLogs?: boolean;
			/**
			 * If logs should be persisted to the Cloudflare observability platform where they can be queried in the dashboard.
			 *
			 * @default true
			 */
			persist?: boolean;
			/**
			 * What destinations logs emitted from the Worker should be sent to.
			 *
			 * @default []
			 */
			destinations?: string[];
		};
		traces?: {
			enabled?: boolean;
			/** The sampling rate. */
			headSamplingRate?: number;
			/**
			 * If traces should be persisted to the Cloudflare observability platform where they can be queried in the dashboard.
			 *
			 * @default true
			 */
			persist?: boolean;
			/**
			 * What destinations traces emitted from the Worker should be sent to.
			 *
			 * @default []
			 */
			destinations?: string[];
		};
	};

	/**
	 * Whether we use `<name>.<subdomain>.workers.dev` to
	 * test and deploy your Worker.
	 *
	 * For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
	 *
	 * @default true
	 */
	workersDev?: boolean;

	/**
	 * Whether we use `<version>-<name>.<subdomain>.workers.dev` to
	 * serve Preview URLs for your Worker.
	 *
	 * @default false
	 */
	previewUrls?: boolean;

	/**
	 * Designates this Worker as an internal-only "first-party" Worker.
	 *
	 * @internal
	 */
	firstPartyWorker?: boolean;

	/**
	 * "Unsafe" tables for runtime features that aren't directly supported by
	 * this configuration. Values are forwarded verbatim in the Worker's
	 * upload metadata.
	 *
	 * @default {}
	 */
	unsafe?: {
		/**
		 * Arbitrary key/value pairs that will be included in the uploaded metadata.  Values specified
		 * here will always be applied to metadata last, so can add new or override existing fields.
		 */
		metadata?: Record<string, unknown>;
		/**
		 * Used for internal capnp uploads for the Workers runtime.
		 */
		capnp?:
			| {
					basePath: string;
					sourceSchemas: string[];
					compiledSchema?: never;
			  }
			| {
					basePath?: never;
					sourceSchemas?: never;
					compiledSchema: string;
			  };
	};

	/**
	 * Bindings exposed on the Worker's `env` object. Construct entries with
	 * `bindings.kv(...)`, `bindings.r2(...)`, etc.
	 */
	env?: Record<string, Binding>;

	/**
	 * Configuration for named exports declared by the Worker. Each entry's
	 * key is the exported class name; the value configures the export.
	 *
	 * Only one export kind is currently supported:
	 *
	 * - Construct entries with `exports.durableObject(...)`.
	 * - Declares Durable Object classes exported from this Worker.
	 *   For more information about Durable Objects, see the documentation at
	 *   https://developers.cloudflare.com/workers/learning/using-durable-objects.
	 *   For reference, see https://developers.cloudflare.com/workers/wrangler/configuration/#durable-objects.
	 */
	exports?: Record<string, Export>;
}

/**
 * Settings shared by the other exports.
 * Authored as a named `settings` export via
 * `defineSettings`.
 */
export interface SettingsConfig {
	/**
	 * Discriminates this config as a settings config.
	 *
	 * Injected automatically by `defineSettings`; only needs to be written by
	 * hand when authoring a raw config object without the helper.
	 */
	type: "settings";

	/**
	 * This is the ID of the account associated with your zone.
	 * You might have more than one account, so make sure to use
	 * the ID of the account associated with the zone/route you
	 * provide, if you provide one. It can also be specified through
	 * the CLOUDFLARE_ACCOUNT_ID environment variable.
	 */
	accountId?: string;

	/**
	 * Specify the compliance region mode of the Worker.
	 *
	 * Although if the user does not specify a compliance region, the default is `public`,
	 * it can be set to `undefined` in configuration to delegate to the CLOUDFLARE_COMPLIANCE_REGION environment variable.
	 */
	complianceRegion?: "public" | "fedramp-high";
}
