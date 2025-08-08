import type { Observability, Route } from "../config/environment";
import type { INHERIT_SYMBOL } from "./bindings";
import type {
	WorkerMetadata,
	WorkerMetadataBinding,
} from "./create-worker-upload-form";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";
import type { Json } from "miniflare";

/**
 * The type of Worker
 */
export type CfScriptFormat = "modules" | "service-worker";

/**
 * A module type.
 */
export type CfModuleType =
	| "esm"
	| "commonjs"
	| "compiled-wasm"
	| "text"
	| "buffer"
	| "python"
	| "python-requirement";

/**
 * An imported module.
 */
export interface CfModule {
	/**
	 * The module name.
	 *
	 * @example
	 * './src/index.js'
	 */
	name: string;
	/**
	 * The absolute path of the module on disk, or `undefined` if this is a
	 * virtual module. Used as the source URL for this module, so source maps are
	 * correctly resolved.
	 *
	 * @example
	 * '/path/to/src/index.js'
	 */
	filePath: string | undefined;
	/**
	 * The module content, usually JavaScript or WASM code.
	 *
	 * @example
	 * export default {
	 *   async fetch(request) {
	 *     return new Response('Ok')
	 *   }
	 * }
	 */
	content: string | Buffer<ArrayBuffer>;
	/**
	 * An optional sourcemap for this module if it's of a ESM or CJS type, this will only be present
	 * if we're deploying with sourcemaps enabled. Since we copy extra modules that aren't bundled
	 * we need to also copy the relevant sourcemaps into the final out directory.
	 */
	sourceMap?: CfWorkerSourceMap;
	/**
	 * The module type.
	 *
	 * If absent, will default to the main module's type.
	 */
	type?: CfModuleType;
}

/**
 * A map of variable names to values.
 */
export interface CfVars {
	[key: string]: string | Json;
}

/**
 * A KV namespace.
 */
export interface CfKvNamespace {
	binding: string;
	id?: string | typeof INHERIT_SYMBOL;
	experimental_remote?: boolean;
	raw?: boolean;
}

/**
 * A binding to send email.
 */
export type CfSendEmailBindings = {
	name: string;
	experimental_remote?: boolean;
} & (
	| { destination_address?: string }
	| { allowed_destination_addresses?: string[] }
);
// export interface CfSendEmailBindings {
// 	name: string;
// 	destination_address?: string | undefined;
// 	allowed_destination_addresses?: string[] | undefined;
// }

/**
 * A binding to a wasm module (in service-worker format)
 */

export interface CfWasmModuleBindings {
	[key: string]: string | Uint8Array<ArrayBuffer>;
}

/**
 * A binding to a text blob (in service-worker format)
 */

export interface CfTextBlobBindings {
	[key: string]: string;
}

/**
 * A binding to a browser
 */

export interface CfBrowserBinding {
	binding: string;
	raw?: boolean;
	experimental_remote?: boolean;
}

/**
 * A binding to the AI project
 */

export interface CfAIBinding {
	binding: string;
	staging?: boolean;
	experimental_remote?: boolean;
	raw?: boolean;
}

/**
 * A binding to Cloudflare Images
 */
export interface CfImagesBinding {
	binding: string;
	raw?: boolean;
	experimental_remote?: boolean;
}

/**
 * A binding to the Worker Version's metadata
 */

export interface CfVersionMetadataBinding {
	binding: string;
}

/**
 * A binding to a data blob (in service-worker format)
 */

export interface CfDataBlobBindings {
	[key: string]: string | Uint8Array<ArrayBuffer>;
}

/**
 * A Durable Object.
 */
export interface CfDurableObject {
	name: string;
	class_name: string;
	script_name?: string;
	environment?: string;
}

export interface CfWorkflow {
	name: string;
	class_name: string;
	binding: string;
	script_name?: string;
	experimental_remote?: boolean;
	raw?: boolean;
}

export interface CfQueue {
	binding: string;
	queue_name: string;
	delivery_delay?: number;
	experimental_remote?: boolean;
	raw?: boolean;
}

export interface CfR2Bucket {
	binding: string;
	bucket_name?: string | typeof INHERIT_SYMBOL;
	jurisdiction?: string;
	experimental_remote?: boolean;
	raw?: boolean;
}

// TODO: figure out if this is duplicated in packages/wrangler/src/config/environment.ts
export interface CfD1Database {
	binding: string;
	database_id?: string | typeof INHERIT_SYMBOL;
	database_name?: string;
	preview_database_id?: string;
	database_internal_env?: string;
	migrations_table?: string;
	migrations_dir?: string;
	experimental_remote?: boolean;
	raw?: boolean;
}

export interface CfVectorize {
	binding: string;
	index_name: string;
	raw?: boolean;
	experimental_remote?: boolean;
}

export interface CfSecretsStoreSecrets {
	binding: string;
	store_id: string;
	secret_name: string;
}

export interface CfHelloWorld {
	binding: string;
	enable_timer?: boolean;
}

export interface CfHyperdrive {
	binding: string;
	id: string;
	localConnectionString?: string;
}

export interface CfService {
	binding: string;
	service: string;
	environment?: string;
	entrypoint?: string;
	props?: Record<string, unknown>;
	experimental_remote?: boolean;
}

export interface CfAnalyticsEngineDataset {
	binding: string;
	dataset?: string;
}

export interface CfDispatchNamespace {
	binding: string;
	namespace: string;
	outbound?: {
		service: string;
		environment?: string;
		parameters?: string[];
	};
	experimental_remote?: boolean;
}

export interface CfMTlsCertificate {
	binding: string;
	certificate_id: string;
	experimental_remote?: boolean;
}

export interface CfLogfwdr {
	bindings: CfLogfwdrBinding[];
}

export interface CfLogfwdrBinding {
	name: string;
	destination: string;
}

export interface CfAssetsBinding {
	binding: string;
}

export interface CfPipeline {
	binding: string;
	pipeline: string;
	experimental_remote?: boolean;
}

export interface CfUnsafeBinding {
	name: string;
	type: string;
}

type CfUnsafeMetadata = Record<string, unknown>;

export type CfCapnp =
	| {
			base_path?: never;
			source_schemas?: never;
			compiled_schema: string;
	  }
	| {
			base_path: string;
			source_schemas: string[];
			compiled_schema?: never;
	  };

export interface CfUnsafe {
	bindings: CfUnsafeBinding[] | undefined;
	metadata: CfUnsafeMetadata | undefined;
	capnp: CfCapnp | undefined;
}

export interface CfDurableObjectMigrations {
	old_tag?: string;
	new_tag: string;
	steps: {
		new_classes?: string[];
		new_sqlite_classes?: string[];
		renamed_classes?: {
			from: string;
			to: string;
		}[];
		deleted_classes?: string[];
	}[];
}

export interface CfPlacement {
	mode: "smart";
	hint?: string;
}

export interface CfTailConsumer {
	service: string;
	environment?: string;
}

export interface CfUserLimits {
	cpu_ms?: number;
}

/**
 * Options for creating a `CfWorker`.
 */
export interface CfWorkerInit {
	/**
	 * The name of the worker.
	 */
	name: string | undefined;
	/**
	 * The entrypoint module.
	 */
	main: CfModule;
	/**
	 * The list of additional modules.
	 */
	modules: CfModule[] | undefined;
	/**
	 * The list of source maps to include on upload.
	 */
	sourceMaps: CfWorkerSourceMap[] | undefined;
	/**
	 * All the bindings
	 */
	bindings: {
		vars: CfVars | undefined;
		kv_namespaces: CfKvNamespace[] | undefined;
		send_email: CfSendEmailBindings[] | undefined;
		wasm_modules: CfWasmModuleBindings | undefined;
		text_blobs: CfTextBlobBindings | undefined;
		browser: CfBrowserBinding | undefined;
		ai: CfAIBinding | undefined;
		images: CfImagesBinding | undefined;
		version_metadata: CfVersionMetadataBinding | undefined;
		data_blobs: CfDataBlobBindings | undefined;
		durable_objects: { bindings: CfDurableObject[] } | undefined;
		workflows: CfWorkflow[] | undefined;
		queues: CfQueue[] | undefined;
		r2_buckets: CfR2Bucket[] | undefined;
		d1_databases: CfD1Database[] | undefined;
		vectorize: CfVectorize[] | undefined;
		hyperdrive: CfHyperdrive[] | undefined;
		secrets_store_secrets: CfSecretsStoreSecrets[] | undefined;
		services: CfService[] | undefined;
		analytics_engine_datasets: CfAnalyticsEngineDataset[] | undefined;
		dispatch_namespaces: CfDispatchNamespace[] | undefined;
		mtls_certificates: CfMTlsCertificate[] | undefined;
		logfwdr: CfLogfwdr | undefined;
		pipelines: CfPipeline[] | undefined;
		unsafe: CfUnsafe | undefined;
		assets: CfAssetsBinding | undefined;
		unsafe_hello_world: CfHelloWorld[] | undefined;
	};

	containers?: { class_name: string }[];

	/**
	 * The raw bindings - this is basically never provided and it'll be the bindings above
	 * but if we're just taking from the api and re-putting then this is how we can do that
	 * without going between the different types
	 */
	rawBindings?: WorkerMetadataBinding[];

	migrations: CfDurableObjectMigrations | undefined;
	compatibility_date: string | undefined;
	compatibility_flags: string[] | undefined;
	keepVars: boolean | undefined;
	keepSecrets: boolean | undefined;
	keepBindings?: WorkerMetadata["keep_bindings"];
	logpush: boolean | undefined;
	placement: CfPlacement | undefined;
	tail_consumers: CfTailConsumer[] | undefined;
	limits: CfUserLimits | undefined;
	annotations?: Record<string, string | undefined>;
	keep_assets?: boolean | undefined;
	assets:
		| {
				jwt: string;
				routerConfig: RouterConfig;
				assetConfig: AssetConfig;
				run_worker_first?: string[] | boolean;
				_redirects?: string;
				_headers?: string;
		  }
		| undefined;
	observability: Observability | undefined;
}

export interface CfWorkerContext {
	env: string | undefined;
	legacyEnv: boolean | undefined;
	zone: string | undefined;
	host: string | undefined;
	routes: Route[] | undefined;
	sendMetrics: boolean | undefined;
}

export interface CfWorkerSourceMap {
	/**
	 * The name of the source map.
	 *
	 * @example
	 * 'out.js.map'
	 */
	name: string;
	/**
	 * The content of the source map, which is a JSON object described by the v3
	 * spec.
	 *
	 * @example
	 * {
	 *   "version" : 3,
	 *   "file": "out.js",
	 *   "sourceRoot": "",
	 *   "sources": ["foo.js", "bar.js"],
	 *   "sourcesContent": [null, null],
	 *   "names": ["src", "maps", "are", "fun"],
	 *   "mappings": "A,AAAB;;ABCDE;"
	 * }
	 */
	content: string | Buffer;
}
