import type { Observability, TailConsumer } from "./config/environment";
import type {
	CfDurableObjectMigrations,
	CfPlacement,
	CfTailConsumer,
	CfUserLimits,
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
				// TODO: check and make sure that we do get a subrequests field here
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
