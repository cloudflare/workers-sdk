import type { Observability, Route } from "./config/environment";
import type { INHERIT_SYMBOL } from "./constants";
import type { Json, WorkerMetadata } from "./types";
import type { AssetConfig, RouterConfig } from "@cloudflare/workers-shared";

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
	remote?: boolean;
	raw?: boolean;
}

/**
 * A binding to send email.
 */
export type CfSendEmailBindings = {
	name: string;
	remote?: boolean;
} & (
	| { destination_address?: string }
	| { allowed_destination_addresses?: string[] }
	| { allowed_sender_addresses?: string[] }
);

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
	remote?: boolean;
}

/**
 * A binding to the AI project
 */

export interface CfAIBinding {
	binding: string;
	staging?: boolean;
	remote?: boolean;
	raw?: boolean;
}

/**
 * A binding to Cloudflare Images
 */
export interface CfImagesBinding {
	binding: string;
	raw?: boolean;
	remote?: boolean;
}

/**
 * A binding to Cloudflare Media Transformations
 */
export interface CfMediaBinding {
	binding: string;
	remote?: boolean;
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
	remote?: boolean;
	raw?: boolean;
}

export interface CfQueue {
	binding: string;
	queue_name: string;
	delivery_delay?: number;
	remote?: boolean;
	raw?: boolean;
}

export interface CfR2Bucket {
	binding: string;
	bucket_name?: string | typeof INHERIT_SYMBOL;
	jurisdiction?: string;
	remote?: boolean;
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
	remote?: boolean;
	raw?: boolean;
}

export interface CfVectorize {
	binding: string;
	index_name: string;
	raw?: boolean;
	remote?: boolean;
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

export interface CfWorkerLoader {
	binding: string;
}

export interface CfRateLimit {
	name: string;
	namespace_id: string;
	simple: {
		limit: number;
		period: 10 | 60;
	};
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
	remote?: boolean;
	cross_account_grant?: string;
}

export interface CfVpcService {
	binding: string;
	service_id: string;
	remote?: boolean;
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
	remote?: boolean;
}

export interface CfMTlsCertificate {
	binding: string;
	certificate_id: string;
	remote?: boolean;
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
	remote?: boolean;
}

export interface CfUnsafeBinding {
	name: string;
	type: string;

	dev?: {
		plugin: {
			/**
			 * Package is the bare specifier of the package that exposes plugins to integrate into Miniflare via a named `plugins` export.
			 * @example "@cloudflare/my-external-miniflare-plugin"
			 */
			package: string;
			/**
			 * Plugin is the name of the plugin exposed by the package.
			 * @example "my-unsafe-plugin"
			 */
			name: string;
		};

		/**
		 * dev-only options to pass to the plugin.
		 */
		options?: Record<string, unknown>;
	};
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

export type CfPlacement =
	| { mode: "smart"; hint?: string }
	| { mode?: "targeted"; region: string }
	| { mode?: "targeted"; host: string }
	| { mode?: "targeted"; hostname: string };

export interface CfTailConsumer {
	service: string;
	environment?: string;
}

export interface CfUserLimits {
	cpu_ms?: number;
	subrequests?: number;
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

	containers: { class_name: string }[] | undefined;

	migrations: CfDurableObjectMigrations | undefined;
	compatibility_date: string | undefined;
	compatibility_flags: string[] | undefined;
	keepVars: boolean | undefined;
	keepSecrets: boolean | undefined;
	keepBindings?: WorkerMetadata["keep_bindings"];
	logpush: boolean | undefined;
	placement: CfPlacement | undefined;
	tail_consumers: CfTailConsumer[] | undefined;
	streaming_tail_consumers?: CfTailConsumer[] | undefined;
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
	useServiceEnvironments: boolean | undefined;
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
