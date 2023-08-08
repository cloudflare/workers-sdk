import type { Route } from "../config/environment";
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
	| "buffer";

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
	 * The module content, usually JavaScript or WASM code.
	 *
	 * @example
	 * export default {
	 *   async fetch(request) {
	 *     return new Response('Ok')
	 *   }
	 * }
	 */
	content: string | Buffer;
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
	id: string;
}

/**
 * A binding to send email.
 */
export interface CfSendEmailBindings {
	name: string;
	destination_address?: string;
	allowed_destination_addresses?: string[];
}

/**
 * A binding to a wasm module (in service-worker format)
 */

export interface CfWasmModuleBindings {
	[key: string]: string;
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
}

/**
 * A binding to a data blob (in service-worker format)
 */

export interface CfDataBlobBindings {
	[key: string]: string;
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

export interface CfQueue {
	binding: string;
	queue_name: string;
}

export interface CfR2Bucket {
	binding: string;
	bucket_name: string;
}

// TODO: figure out if this is duplicated in packages/triangle/src/config/environment.ts
export interface CfD1Database {
	binding: string;
	database_id: string;
	database_name?: string;
	preview_database_id?: string;
	database_internal_env?: string;
	migrations_table?: string;
	migrations_dir?: string;
}

export interface CfConstellation {
	binding: string;
	project_id: string;
}

interface CfService {
	binding: string;
	service: string;
	environment?: string;
}

interface CfAnalyticsEngineDataset {
	binding: string;
	dataset?: string;
}

interface CfDispatchNamespace {
	binding: string;
	namespace: string;
	outbound?: {
		service: string;
		environment?: string;
		parameters?: string[];
	};
}

interface CfMTlsCertificate {
	binding: string;
	certificate_id: string;
}

interface CfLogfwdr {
	bindings: CfLogfwdrBinding[];
}

interface CfLogfwdrBinding {
	name: string;
	destination: string;
}

interface CfUnsafeBinding {
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

interface CfUnsafe {
	bindings: CfUnsafeBinding[] | undefined;
	metadata: CfUnsafeMetadata | undefined;
	capnp: CfCapnp | undefined;
}

export interface CfDurableObjectMigrations {
	old_tag?: string;
	new_tag: string;
	steps: {
		new_classes?: string[];
		renamed_classes?: {
			from: string;
			to: string;
		}[];
		deleted_classes?: string[];
	}[];
}

export interface CfPlacement {
	mode: "smart";
}

export interface CfTailConsumer {
	service: string;
	environment?: string;
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
	 * All the bindings
	 */
	bindings: {
		vars: CfVars | undefined;
		kv_namespaces: CfKvNamespace[] | undefined;
		send_email: CfSendEmailBindings[] | undefined;
		wasm_modules: CfWasmModuleBindings | undefined;
		text_blobs: CfTextBlobBindings | undefined;
		browser: CfBrowserBinding | undefined;
		data_blobs: CfDataBlobBindings | undefined;
		durable_objects: { bindings: CfDurableObject[] } | undefined;
		queues: CfQueue[] | undefined;
		r2_buckets: CfR2Bucket[] | undefined;
		d1_databases: CfD1Database[] | undefined;
		constellation: CfConstellation[] | undefined;
		services: CfService[] | undefined;
		analytics_engine_datasets: CfAnalyticsEngineDataset[] | undefined;
		dispatch_namespaces: CfDispatchNamespace[] | undefined;
		mtls_certificates: CfMTlsCertificate[] | undefined;
		logfwdr: CfLogfwdr | undefined;
		unsafe: CfUnsafe | undefined;
	};
	migrations: CfDurableObjectMigrations | undefined;
	compatibility_date: string | undefined;
	compatibility_flags: string[] | undefined;
	usage_model: "bundled" | "unbound" | undefined;
	keepVars: boolean | undefined;
	logpush: boolean | undefined;
	placement: CfPlacement | undefined;
	tail_consumers: CfTailConsumer[] | undefined;
}

export interface CfWorkerContext {
	env: string | undefined;
	legacyEnv: boolean | undefined;
	zone: string | undefined;
	host: string | undefined;
	routes: Route[] | undefined;
	sendMetrics: boolean | undefined;
}
